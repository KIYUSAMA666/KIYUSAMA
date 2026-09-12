// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMON_MEMORY_CURRENT_RESOLUTION_V01,
  resolveCommonMemoryCurrent,
} from "../src/common-memory-current-resolution.js";

function snapshot(revision = 1) {
  return {
    identity: {
      stateId: "CS-MAIN",
      schemaVersion: "0.1",
      stateRevision: revision,
      effectiveAt: `2026-09-13T08:${String(revision).padStart(2, "0")}:00+09:00`,
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-MAIN-001",
    },
    humanDecisionFinal: {
      decisionId: `HD-${revision}`,
      sourceAuthority: "KIYUSAMA",
      shortDirective: "continue",
    },
    mainLineTask: { taskId: "ML-1", description: "COMMON MEMORY integration" },
    nextActionSingle: { actionId: `NA-${revision}`, description: "next" },
    activeRolesAndAuthority: { SORA: "AGGREGATOR", KIRA: "INDEPENDENT_VERIFIER" },
    activeGuards: [],
    confirmedRefIndex: [],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-13T08:00:00+09:00",
      evidenceSource: "KIRA",
    },
  };
}

function memory(id, memoryClass, payload) {
  return { id, memoryClass, payload };
}

test("1 one valid CURRENT resolves", () => {
  const decision = resolveCommonMemoryCurrent([memory("M1", "CURRENT", snapshot(1))]);
  assert.equal(decision.status, "RESOLVED");
  assert.equal(decision.sourceMemoryId, "M1");
  assert.equal(decision.snapshot.identity.stateRevision, 1);
  assert.equal(decision.resolutionVersion, COMMON_MEMORY_CURRENT_RESOLUTION_V01);
});

test("2 retrieval ranking cannot make older CURRENT win", () => {
  const decision = resolveCommonMemoryCurrent([
    memory("NEW", "CURRENT", snapshot(5)),
    memory("OLD", "CURRENT", snapshot(2)),
  ]);
  assert.equal(decision.status, "RESOLVED");
  assert.equal(decision.sourceMemoryId, "NEW");
  assert.equal(decision.snapshot.identity.stateRevision, 5);
});

test("3 reversed retrieval order still selects newest CURRENT", () => {
  const decision = resolveCommonMemoryCurrent([
    memory("OLD", "CURRENT", snapshot(2)),
    memory("NEW", "CURRENT", snapshot(5)),
  ]);
  assert.equal(decision.status, "RESOLVED");
  assert.equal(decision.sourceMemoryId, "NEW");
});

test("4 non-CURRENT memories never become executable", () => {
  const decision = resolveCommonMemoryCurrent([
    memory("H", "HISTORY", snapshot(99)),
    memory("F", "FAIL", snapshot(100)),
    memory("R", "REJECTED", snapshot(101)),
    memory("C", "CURRENT", snapshot(3)),
  ]);
  assert.equal(decision.status, "RESOLVED");
  assert.equal(decision.sourceMemoryId, "C");
  assert.equal(decision.snapshot.identity.stateRevision, 3);
});

test("5 no CURRENT memory holds", () => {
  const decision = resolveCommonMemoryCurrent([
    memory("H", "HISTORY", snapshot(1)),
    memory("E", "EVIDENCE", snapshot(2)),
  ]);
  assert.deepEqual(decision, {
    status: "HOLD",
    reason: "NO_CURRENT_MEMORY",
    resolutionVersion: COMMON_MEMORY_CURRENT_RESOLUTION_V01,
  });
});

test("6 malformed CURRENT payload holds even when another CURRENT is valid", () => {
  const decision = resolveCommonMemoryCurrent([
    memory("GOOD", "CURRENT", snapshot(2)),
    memory("BAD", "CURRENT", { identity: { stateId: "CS-MAIN" } }),
  ]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "INVALID_CURRENT_PAYLOAD");
});

test("7 blank CURRENT memory id holds", () => {
  const decision = resolveCommonMemoryCurrent([memory("   ", "CURRENT", snapshot(1))]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "INVALID_CURRENT_PAYLOAD");
});

test("8 same revision different payload holds", () => {
  const a = snapshot(4);
  const b = structuredClone(a);
  b.mainLineTask.description = "tampered";
  const decision = resolveCommonMemoryCurrent([
    memory("A", "CURRENT", a),
    memory("B", "CURRENT", b),
  ]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "STATE_CONFLICT");
});

test("9 different lineage holds even when one revision is newer", () => {
  const b = snapshot(5);
  b.identity.lineageId = "LINEAGE-FOREIGN";
  const decision = resolveCommonMemoryCurrent([
    memory("A", "CURRENT", snapshot(4)),
    memory("B", "CURRENT", b),
  ]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "LINEAGE_CONFLICT");
});

test("10 different stateId holds instead of silently selecting higher revision", () => {
  const b = snapshot(5);
  b.identity.stateId = "CS-FOREIGN";
  const decision = resolveCommonMemoryCurrent([
    memory("A", "CURRENT", snapshot(4)),
    memory("B", "CURRENT", b),
  ]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "STATE_ID_CONFLICT");
});

test("11 schema version split holds", () => {
  const b = snapshot(5);
  b.identity.schemaVersion = "0.2";
  const decision = resolveCommonMemoryCurrent([
    memory("A", "CURRENT", snapshot(4)),
    memory("B", "CURRENT", b),
  ]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "SCHEMA_VERSION_CONFLICT");
});

test("12 non-KIYUSAMA CURRENT authority is malformed", () => {
  const bad = snapshot(2);
  bad.humanDecisionFinal.sourceAuthority = "SORA";
  const decision = resolveCommonMemoryCurrent([memory("BAD", "CURRENT", bad)]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "INVALID_CURRENT_PAYLOAD");
});

test("13 invalid effectiveAt is malformed", () => {
  const bad = snapshot(2);
  bad.identity.effectiveAt = "not-a-time";
  const decision = resolveCommonMemoryCurrent([memory("BAD", "CURRENT", bad)]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "INVALID_CURRENT_PAYLOAD");
});

test("14 object-key reordering at same revision remains equivalent", () => {
  const a = snapshot(3);
  const b = structuredClone(a);
  b.activeRolesAndAuthority = { KIRA: "INDEPENDENT_VERIFIER", SORA: "AGGREGATOR" };
  const decision = resolveCommonMemoryCurrent([
    memory("A", "CURRENT", a),
    memory("B", "CURRENT", b),
  ]);
  assert.equal(decision.status, "RESOLVED");
  assert.equal(decision.snapshot.identity.stateRevision, 3);
});

test("15 malformed active guard entry holds", () => {
  const bad = snapshot(2);
  bad.activeGuards = [{ guardId: "G1", rule: "guard", refConfirmed: "FORGED" }];
  const decision = resolveCommonMemoryCurrent([memory("BAD", "CURRENT", bad)]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "INVALID_CURRENT_PAYLOAD");
});

test("16 malformed confirmed ref entry holds", () => {
  const bad = snapshot(2);
  bad.confirmedRefIndex = [{ id: "REF1", status: "VERIFIED", expectedVersion: 7, path: null }];
  const decision = resolveCommonMemoryCurrent([memory("BAD", "CURRENT", bad)]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "INVALID_CURRENT_PAYLOAD");
});

test("17 malformed active role value holds", () => {
  const bad = snapshot(2);
  bad.activeRolesAndAuthority = { SORA: 42 };
  const decision = resolveCommonMemoryCurrent([memory("BAD", "CURRENT", bad)]);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "INVALID_CURRENT_PAYLOAD");
});
