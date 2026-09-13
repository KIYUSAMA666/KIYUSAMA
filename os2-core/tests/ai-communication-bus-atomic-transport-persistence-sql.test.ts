import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(resolve(here, "../sql/ai-communication-bus-atomic-transport-persistence-v01.sql"), "utf8");

test("creates durable transport evidence table bound to message identity", () => {
  assert.match(sql, /create table if not exists os2_bus_v01\.transport_evidence/i);
  assert.match(sql, /message_id text primary key references os2_bus_v01\.messages\(message_id\)/i);
});

test("transport evidence is DELIVERED-only and requires provider delivery id", () => {
  assert.match(sql, /status text not null check \(status = 'DELIVERED'\)/i);
  assert.match(sql, /provider_delivery_id text not null/i);
  assert.match(sql, /check \(btrim\(provider_delivery_id\) <> ''\)/i);
});

test("single RPC validates message delivery and transport binding", () => {
  assert.match(sql, /os2_bus_persist_delivered_with_transport/i);
  assert.match(sql, /p_delivery->>'status' <> 'DELIVERED'/i);
  assert.match(sql, /p_evidence->>'status' <> 'DELIVERED'/i);
  assert.match(sql, /p_evidence->>'messageId' <> v_message_id/i);
  assert.match(sql, /p_evidence->>'traceId' <> v_trace_id/i);
  assert.match(sql, /p_evidence->>'targetAgentId' <> v_target/i);
});

test("direct DELIVERED creation is explicitly documented as a distinct atomic boundary", () => {
  assert.match(sql, /DESIGN NOTE — intentional direct DELIVERED creation path/i);
  assert.match(sql, /existing os2_bus_store_record entry point starts a brand-new durable BUS[\s\S]*at PENDING/i);
  assert.match(sql, /called only after the provider has[\s\S]*returned explicit DELIVERED evidence/i);
  assert.match(sql, /same PostgreSQL transaction[\s\S]*exact transport evidence/i);
  assert.match(sql, /must never become a generic alternate BUS[\s\S]*writer or a source of execution authority/i);
});

test("migration ordering dependency on existing durable BUS messages is explicit", () => {
  assert.match(sql, /MIGRATION ORDER: os2_bus_v01\.messages must already exist/i);
});

test("existing BUS message identity remains row-locked before idempotency decision", () => {
  assert.match(sql, /from os2_bus_v01\.messages[\s\S]*where message_id = v_message_id[\s\S]*for update/i);
});

test("transport evidence replay preserves least privilege without UPDATE locking", () => {
  assert.match(sql, /service_role intentionally receives only[\s\S]*SELECT \+ INSERT, never UPDATE/i);
  assert.match(sql, /ON CONFLICT DO NOTHING already waits for a[\s\S]*concurrent same-key insertion/i);
  assert.match(sql, /select \* into v_evidence[\s\S]*from os2_bus_v01\.transport_evidence[\s\S]*where message_id = v_message_id;/i);
  assert.doesNotMatch(sql, /from os2_bus_v01\.transport_evidence[\s\S]*where message_id = v_message_id[\s\S]*for update/i);
  assert.match(sql, /grant select, insert on table os2_bus_v01\.transport_evidence to service_role/i);
  assert.doesNotMatch(sql, /grant[^;]*update[^;]*os2_bus_v01\.transport_evidence/i);
});

test("concurrent first message writers converge through ON CONFLICT then locked re-read", () => {
  assert.match(sql, /insert into os2_bus_v01\.messages[\s\S]*on conflict \(message_id\) do nothing/i);
  assert.match(sql, /on conflict \(message_id\) do nothing;[\s\S]*select \* into v_existing[\s\S]*for update/i);
});

test("concurrent first evidence writers converge and STORED versus IDEMPOTENT is explicit", () => {
  assert.match(sql, /insert into os2_bus_v01\.transport_evidence[\s\S]*on conflict \(message_id\) do nothing/i);
  assert.match(sql, /get diagnostics v_inserted_evidence = row_count/i);
  assert.match(sql, /case when v_inserted_evidence = 1 then 'STORED' else 'IDEMPOTENT' end/i);
});

test("conflicting replay fails closed instead of rewriting evidence", () => {
  assert.match(sql, /v_evidence\.provider_delivery_id <> v_provider_delivery_id/i);
  assert.match(sql, /return jsonb_build_object\('status','BINDING_MISMATCH'\)/i);
  assert.doesNotMatch(sql, /update os2_bus_v01\.transport_evidence/i);
});

test("RPC is service-role only and transport table has RLS", () => {
  assert.match(sql, /alter table os2_bus_v01\.transport_evidence enable row level security/i);
  assert.match(sql, /revoke all on function public\.os2_bus_persist_delivered_with_transport\(jsonb,jsonb,jsonb\)[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.os2_bus_persist_delivered_with_transport\(jsonb,jsonb,jsonb\)[\s\S]*to service_role/i);
});

test("backend exceptions fail closed", () => {
  assert.match(sql, /exception when others then[\s\S]*'BACKEND_FAILURE'/i);
});
