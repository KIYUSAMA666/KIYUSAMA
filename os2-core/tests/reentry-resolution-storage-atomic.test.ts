import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(resolve(here, "../sql/reentry-resolution-storage-atomic-v01.sql"), "utf8");

const mustContain = (text: string) => assert.equal(sql.includes(text), true, `missing SQL invariant: ${text}`);

test("creates durable UNKNOWN storage", () => {
  mustContain("create table if not exists os2_reentry_v01.unknown_outcomes");
  mustContain("authority_key text primary key");
  mustContain("consumed_at timestamptz null");
});

test("creates durable resolution receipt storage", () => {
  mustContain("create table if not exists os2_reentry_v01.resolution_receipts");
  mustContain("check (finalized_at >= unknown_observed_at)");
});

test("uses one PostgreSQL RPC boundary", () => {
  mustContain("create or replace function public.os2_reentry_close_unknown_with_resolution_receipt(p_input jsonb)");
  mustContain("language plpgsql");
  mustContain("security invoker");
});

test("locks exact UNKNOWN row before resolving", () => {
  mustContain("from os2_reentry_v01.unknown_outcomes");
  mustContain("for update;");
});

test("binds authority and all durable identifiers", () => {
  for (const field of ["authority_key","lease_id","action_id","state_id","state_revision","commit_sequence","result_id","handoff_id","observed_at"]) {
    mustContain(field);
  }
});

test("writes receipt before consuming UNKNOWN in same nested block", () => {
  const insertAt = sql.indexOf("insert into os2_reentry_v01.resolution_receipts");
  const consumeAt = sql.indexOf("update os2_reentry_v01.unknown_outcomes");
  assert.ok(insertAt > -1 && consumeAt > insertAt);
});

test("fails closed if UNKNOWN changes during resolution", () => {
  mustContain("UNKNOWN_CHANGED_DURING_RESOLUTION");
  mustContain("BACKEND_FAILURE");
});

test("supports exact idempotent ALREADY_RESOLVED", () => {
  mustContain("'status','ALREADY_RESOLVED'");
  mustContain("v_receipt.finalized_at = v_finalized_at");
});

test("conflicting duplicate receipt cannot become success", () => {
  mustContain("when unique_violation then");
  mustContain("return jsonb_build_object('status','BINDING_MISMATCH')");
});

test("malformed input cannot enter write block", () => {
  mustContain("jsonb_typeof(p_input) <> 'object'");
  mustContain("v_finalized_at < v_unknown_observed_at");
});

test("anonymous callers cannot execute resolution RPC", () => {
  mustContain("revoke all on function public.os2_reentry_close_unknown_with_resolution_receipt(jsonb) from public, anon, authenticated");
  mustContain("grant execute on function public.os2_reentry_close_unknown_with_resolution_receipt(jsonb) to service_role");
});

test("resolution SQL has no CURRENT mutation or execution authority grant", () => {
  assert.equal(/update\s+os2_storage_v01\.current_state/i.test(sql), false);
  assert.equal(sql.includes("ALLOW_EXECUTION"), false);
  assert.equal(sql.includes("CLAIM_LEASE"), false);
  assert.equal(sql.includes("COMMITTED"), false);
});
