import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(resolve(here, "../sql/ai-communication-bus-durable-backend-v01.sql"), "utf8");

test("1 backend uses private schema and service_role only grants", () => {
  assert.match(sql, /create schema if not exists os2_bus_v01/i);
  assert.match(sql, /revoke all on schema os2_bus_v01 from public, anon, authenticated/i);
  assert.match(sql, /grant usage on schema os2_bus_v01 to service_role/i);
});

test("2 durable table has one message identity primary key", () => {
  assert.match(sql, /message_id text primary key/i);
});

test("3 durable status includes UNKNOWN and terminal state", () => {
  assert.match(sql, /'PENDING','DELIVERED','ACKNOWLEDGED','UNKNOWN','TERMINAL_FAILED'/);
});

test("4 self loop is rejected in database constraint", () => {
  assert.match(sql, /check \(source_agent_id <> target_agent_id\)/i);
});

test("5 store RPC locks the message row before transition", () => {
  assert.match(sql, /where message_id = v_message_id for update/i);
});

test("6 database transition graph forbids reopening acknowledged and terminal rows", () => {
  assert.match(sql, /v_existing\.status = 'PENDING'.*'DELIVERED','UNKNOWN','TERMINAL_FAILED'/s);
  assert.match(sql, /v_existing\.status = 'DELIVERED'.*'ACKNOWLEDGED','UNKNOWN'/s);
  assert.match(sql, /v_existing\.status = 'UNKNOWN'.*'PENDING','DELIVERED','TERMINAL_FAILED'/s);
  assert.doesNotMatch(sql, /v_existing\.status = 'ACKNOWLEDGED' and/i);
  assert.doesNotMatch(sql, /v_existing\.status = 'TERMINAL_FAILED' and/i);
});

test("7 RPCs are SECURITY INVOKER and not executable by public clients", () => {
  const invokers = sql.match(/security invoker/gi) ?? [];
  assert.equal(invokers.length, 2);
  assert.match(sql, /revoke all on function public\.os2_bus_store_record\(text,jsonb\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.os2_bus_read_record\(text\) from public, anon, authenticated/i);
});

test("8 durable table enables RLS defense in depth", () => {
  assert.match(sql, /alter table os2_bus_v01\.messages enable row level security/i);
});
