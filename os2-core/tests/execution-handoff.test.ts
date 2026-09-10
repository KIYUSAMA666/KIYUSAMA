// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExecutionHandoff, MAX_EXECUTION_HANDOFF_TTL_MS } from "../src/execution-handoff.js";

function snapshot() {
  return {
    identity: {
      stateId: "CS-1",
      schemaVersion: "0.1",
      stateRevision: 1,
      effectiveAt: "2026-09-10T16:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-MAIN-001",
    },
    humanDecisionFinal: {
      decisionId: "HD-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "test execution handoff",
    },
    mainLineTask: { taskId: "ML-1", description: "test" },
    nextActionSingle: { actionId: "NA-1", description: "execute" },
    activeRolesAndAuthority: {},
    activeGuards: [],
    confirmedRefIndex: [{ id: "REF-1", status: "VERIFIED", expectedVersion: "1", path: "evidence/REF-1" }],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-10T16:00:00+09:00",
      evidenceSource: "KIRA",
    },
  };
}

function capabilitySlot() {
  return {
    slotId: "S-1",
    capabilityId: "CAP-A",
    status: "BOUND",
    binding: {
      capabilityId: "CAP-A",
      implementationId: "IMPL-1",
      source: "NATIVE",
      version: "1",
      verified: true,
    },
  };
}

function input() {
  return {
    snapshot: snapshot(),
    actionEvidenceRequirement: {
      actionId: "NA-1",
      requiredRefIds: ["REF-1"],
      requireIndependentLane: false,
    },
    capabilitySlot: capabilitySlot(),
    gateDecision: { status: "ALLOW", actionId: "NA-1", stateId: "CS-1", stateRevision: 1 },
  };
}

function request() {
  return {
    handoffId: "HO-1",
    traceId: "TRACE-1",
    actionId: "NA-1",
    sourceStateId: "CS-1",
    sourceStateRevision: 1,
    capabilityId: "CAP-A",
    implementationId: "IMPL-1",
    issuedAt: "2026-09-10T16:00:00+09:00",
    expiresAt: "2026-09-10T17:00:00+09:00",
    evidenceRefIds: ["REF-1"],
  };
}

const NOW = "2026-09-10T16:30:00+09:00";

test("1 all locked READY conditions satisfied", () => {
  assert.deepEqual(evaluateExecutionHandoff(input(), request(), NOW), { status: "READY" });
});

test("2 gate not allowed holds", () => {
  const i = input();
  i.gateDecision = { status: "HOLD", reason: "ACTION_NOT_CURRENT" };
  assert.deepEqual(evaluateExecutionHandoff(i, request(), NOW), { status: "HOLD", reason: "GATE_NOT_ALLOWED" });
});

test("3 capability not ready holds", () => {
  const i = input();
  i.capabilitySlot = { slotId: "S-1", capabilityId: "CAP-A", status: "EMPTY", binding: null };
  assert.deepEqual(evaluateExecutionHandoff(i, request(), NOW), { status: "HOLD", reason: "CAPABILITY_NOT_READY" });
});

test("4 action or capability binding mismatch holds", () => {
  const r = request();
  r.implementationId = "IMPL-OTHER";
  assert.deepEqual(evaluateExecutionHandoff(input(), r, NOW), { status: "HOLD", reason: "HANDOFF_MISMATCH" });
});

test("5 changed source stateId is rejected by gate decision binding", () => {
  const r = request();
  r.sourceStateId = "CS-OLD";
  assert.deepEqual(evaluateExecutionHandoff(input(), r, NOW), { status: "HOLD", reason: "GATE_DECISION_MISMATCH" });
});

test("6 changed source stateRevision is rejected by gate decision binding", () => {
  const r = request();
  r.sourceStateRevision = 0;
  assert.deepEqual(evaluateExecutionHandoff(input(), r, NOW), { status: "HOLD", reason: "GATE_DECISION_MISMATCH" });
});

test("7 missing required evidence holds", () => {
  const r = request();
  r.evidenceRefIds = [];
  assert.deepEqual(evaluateExecutionHandoff(input(), r, NOW), { status: "HOLD", reason: "EVIDENCE_NOT_VERIFIED" });
});

test("8 evidence no longer verified holds", () => {
  const i = input();
  i.snapshot.confirmedRefIndex[0].status = "UNVERIFIED_REF";
  assert.deepEqual(evaluateExecutionHandoff(i, request(), NOW), { status: "HOLD", reason: "EVIDENCE_NOT_VERIFIED" });
});

test("9 expired handoff holds", () => {
  const r = request();
  r.expiresAt = NOW;
  assert.deepEqual(evaluateExecutionHandoff(input(), r, NOW), { status: "HOLD", reason: "EXPIRED" });
});

test("10 invalid evaluation time fails closed", () => {
  assert.deepEqual(evaluateExecutionHandoff(input(), request(), "not-a-time"), { status: "HOLD", reason: "INVALID_LIFETIME" });
});

test("11 gate decision action binding mismatch holds", () => {
  const i = input();
  i.gateDecision.actionId = "NA-OLD";
  assert.deepEqual(evaluateExecutionHandoff(i, request(), NOW), { status: "HOLD", reason: "GATE_DECISION_MISMATCH" });
});

test("12 gate decision state binding mismatch holds", () => {
  const i = input();
  i.gateDecision.stateRevision = 0;
  assert.deepEqual(evaluateExecutionHandoff(i, request(), NOW), { status: "HOLD", reason: "GATE_DECISION_MISMATCH" });
});

test("13 required independent lane not ready holds", () => {
  const i = input();
  i.actionEvidenceRequirement.requireIndependentLane = true;
  i.snapshot.independentLaneHealth.status = "UNVERIFIED";
  i.snapshot.independentLaneHealth.evidenceVerdict = "INSUFFICIENT";
  assert.deepEqual(evaluateExecutionHandoff(i, request(), NOW), { status: "HOLD", reason: "INDEPENDENT_LANE_NOT_READY" });
});

test("14 excessive TTL holds", () => {
  const r = request();
  r.expiresAt = new Date(Date.parse(r.issuedAt) + MAX_EXECUTION_HANDOFF_TTL_MS + 1).toISOString();
  assert.deepEqual(evaluateExecutionHandoff(input(), r, NOW), { status: "HOLD", reason: "INVALID_LIFETIME" });
});

test("15 issuedAt in the future holds", () => {
  const r = request();
  r.issuedAt = "2026-09-10T16:45:00+09:00";
  r.expiresAt = "2026-09-10T17:00:00+09:00";
  assert.deepEqual(evaluateExecutionHandoff(input(), r, NOW), { status: "HOLD", reason: "INVALID_LIFETIME" });
});
