import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../sql/kira-managed-execution-id-binding-v01.sql", import.meta.url), "utf8");

test("adds durable claimed_execution_id", () => {
  assert.match(sql, /add column if not exists claimed_execution_id text/i);
  assert.match(sql, /claimed_execution_id=p_execution_id/i);
});

test("claim requires empty durable execution binding", () => {
  assert.match(sql, /claimed_by is null and claimed_execution_id is null/i);
});

test("reply rejects execution id mismatch", () => {
  assert.match(sql, /v_src\.claimed_execution_id is null or v_src\.claimed_execution_id <> p_execution_id/i);
  assert.match(sql, /EXECUTION_ID_MISMATCH/);
});

test("reply terminal update stays bound to exact execution id", () => {
  assert.match(sql, /where id=v_src\.id and claimed_execution_id=p_execution_id/i);
});

test("release requires exact execution id and clears binding", () => {
  assert.match(sql, /claimed_execution_id=p_execution_id/i);
  assert.match(sql, /claimed_execution_id=null/i);
});

test("claim and reply return execution id as evidence", () => {
  const hits = sql.match(/'execution_id',p_execution_id/g) ?? [];
  assert.ok(hits.length >= 4);
});

test("execution id shape is constrained", () => {
  assert.match(sql, /length\(btrim\(claimed_execution_id\)\) >= 8/i);
  assert.match(sql, /length\(claimed_execution_id\) <= 200/i);
});
