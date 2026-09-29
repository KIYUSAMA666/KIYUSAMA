// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  SORA_CENTRAL_NERVE_CANARY_PAIRS,
  retrieveSoraCentralNerveCurrent,
} from "../src/sora-central-nerve-current.js";

function snapshot(revision = 3) {
  return {
    identity: { stateId: "SORA-CURRENT", schemaVersion: "0.1", stateRevision: revision, effectiveAt: "2026-09-29T00:00:00Z", scope: "KIYUSAMA_OS_2", lineageId: "SORA-LINEAGE" },
    humanDecisionFinal: { decisionId: "HD-1", sourceAuthority: "KIYUSAMA", shortDirective: "continue current work" },
    mainLineTask: { taskId: "ML-1", description: "central nerve" },
    nextActionSingle: { actionId: "NA-1", description: "read canonical CURRENT" },
    activeRolesAndAuthority: {}, activeGuards: [], confirmedRefIndex: [],
    independentLaneHealth: { status: "VERIFIED", evidenceVerdict: "SUFFICIENT", observedAt: "2026-09-29T00:00:00Z", evidenceSource: "COMMON_MEMORY" },
  };
}

test("the exact five pair canaries retrieve CURRENT through canonical records", async () => {
  assert.deepEqual(SORA_CENTRAL_NERVE_CANARY_PAIRS, ["1-7", "2-8", "4-9", "5-10", "6-11"]);
  const calls = [];
  const reader = { async readCanonicalRecords(pair) { calls.push(pair); return [{ id: `CURRENT-${pair}`, memoryClass: "CURRENT", payload: snapshot() }]; } };
  for (const pair of SORA_CENTRAL_NERVE_CANARY_PAIRS) {
    const result = await retrieveSoraCentralNerveCurrent(reader, pair);
    assert.equal(result.status, "RESOLVED");
    assert.equal(result.sourceMemoryId, `CURRENT-${pair}`);
  }
  assert.deepEqual(calls, SORA_CENTRAL_NERVE_CANARY_PAIRS);
});

test("conversation and history records cannot supply durable CURRENT", async () => {
  const result = await retrieveSoraCentralNerveCurrent(
    { async readCanonicalRecords() { return [
      { id: "CONVERSATION", memoryClass: "CONVERSATION", payload: snapshot(99) },
      { id: "HISTORY", memoryClass: "HISTORY", payload: snapshot(98) },
    ]; } },
    "1-7",
  );
  assert.deepEqual(result, { status: "HOLD", reason: "NO_CURRENT_MEMORY", resolutionVersion: "COMMON_MEMORY_CURRENT_RESOLUTION_V01" });
});

test("canonical reader failure holds closed", async () => {
  const result = await retrieveSoraCentralNerveCurrent(
    { async readCanonicalRecords() { throw new Error("unavailable"); } },
    "6-11",
  );
  assert.deepEqual(result, { status: "HOLD", reason: "BACKEND_FAILURE" });
});
