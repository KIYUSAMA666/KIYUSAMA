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

test("existing message and evidence rows are locked before idempotency decision", () => {
  assert.match(sql, /from os2_bus_v01\.messages[\s\S]*where message_id = v_message_id[\s\S]*for update/i);
  assert.match(sql, /from os2_bus_v01\.transport_evidence[\s\S]*where message_id = v_message_id[\s\S]*for update/i);
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
