// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { selectExecutionCandidate, selectExecutionCandidates } from "../src/memory-selection.js";

const blocked = ["CONFIRMED", "HISTORY", "EVIDENCE", "FAIL", "REJECTED", "DELETED", "CLOSED"];

function record(memoryClass, id = memoryClass) {
  return { id, memoryClass, payload: `payload:${id}` };
}

test("CURRENT is executable", () => {
  assert.equal(selectExecutionCandidate(record("CURRENT")).status, "EXECUTION_CANDIDATE");
});

test("every non-CURRENT class is blocked from execution", () => {
  for (const memoryClass of blocked) {
    assert.deepEqual(selectExecutionCandidate(record(memoryClass)), {
      status: "NOT_EXECUTABLE",
      reason: "NON_CURRENT_MEMORY",
    });
  }
});

test("mixed retrieval returns only CURRENT as execution candidates", () => {
  const records = [record("HISTORY", "old-mainline"), record("FAIL", "failed-route"), record("EVIDENCE", "old-proof"), record("CURRENT", "current-mainline"), record("CLOSED", "closed-unit")];
  assert.deepEqual(selectExecutionCandidates(records).map((item) => item.id), ["current-mainline"]);
});

test("search ordering cannot promote stale memory", () => {
  const records = [record("FAIL", "top-search-hit"), record("HISTORY", "second-search-hit"), record("CURRENT", "lower-ranked-current")];
  assert.deepEqual(selectExecutionCandidates(records).map((item) => item.id), ["lower-ranked-current"]);
});

test("no CURRENT means no execution candidate", () => {
  assert.equal(selectExecutionCandidates(blocked.map((memoryClass) => record(memoryClass))).length, 0);
});
