import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(resolve(here, "../sql/handoff-durable-sources-v01.sql"), "utf8");

test("1 reuses existing executor capability identity instead of creating a duplicate capability system", () => {
  assert.match(sql, /capability_id uuid primary key references common_memory\.executor_capabilities\(id\)/i);
  assert.doesNotMatch(sql, /create table[^;]*executor_capabilities/i);
});

test("2 implementation verification semantics are separate from payload hash semantics", () => {
  assert.match(sql, /implementation_id text not null/i);
  assert.match(sql, /verified boolean not null/i);
  assert.match(sql, /verification_ref text/i);
  assert.match(sql, /NOT equivalent to common_memory\.executor_capabilities\.payload_hash/i);
});

test("3 capability binding revision is mandatory and positive", () => {
  assert.match(sql, /binding_revision bigint not null check \(binding_revision > 0\)/i);
  assert.match(sql, /p_expected_revision bigint/i);
  assert.match(sql, /STALE_BINDING/i);
});

test("4 evidence requirement source is pre-execution registry with mandatory revision", () => {
  assert.match(sql, /create table if not exists os2_handoff_v01\.action_evidence_requirements/i);
  assert.match(sql, /action_id text primary key/i);
  assert.match(sql, /requirement_revision bigint not null check \(requirement_revision > 0\)/i);
  assert.match(sql, /required_refs jsonb not null/i);
  assert.match(sql, /require_independent_lane boolean not null/i);
  assert.match(sql, /STALE_REQUIREMENT/i);
});

test("5 requiredRefs JSON is exact-shape and duplicate-id validated", () => {
  assert.match(sql, /array\['expectedVersion','id','path'\]::text\[\]/i);
  assert.match(sql, /count\(\*\) = count\(distinct value->>'id'\)/i);
  assert.match(sql, /check \(os2_handoff_v01\.valid_required_refs\(required_refs\)\)/i);
});

test("6 bound capability requires verified binding evidence", () => {
  assert.match(sql, /status <> 'BOUND'[\s\S]*verified is true[\s\S]*verification_ref is not null/i);
});

test("7 read RPCs are fail-closed on stale revisions and unavailable to public clients", () => {
  assert.match(sql, /os2_handoff_read_capability_binding_v01/i);
  assert.match(sql, /os2_handoff_read_action_evidence_requirement_v01/i);
  assert.match(sql, /revoke all on function public\.os2_handoff_read_capability_binding_v01\(uuid,bigint\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.os2_handoff_read_action_evidence_requirement_v01\(text,bigint\) from public, anon, authenticated/i);
});

test("8 schema is private and tables use RLS defense in depth", () => {
  assert.match(sql, /revoke all on schema os2_handoff_v01 from public, anon, authenticated/i);
  assert.match(sql, /alter table os2_handoff_v01\.capability_bindings enable row level security/i);
  assert.match(sql, /alter table os2_handoff_v01\.action_evidence_requirements enable row level security/i);
});
