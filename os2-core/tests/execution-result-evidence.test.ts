// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExecutionResultEvidence } from "../src/execution-result-evidence.js";

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
      shortDirective: "test execution result evidence",
    },
    mainLineTask: { taskId: "ML-1", description: "test" },
    nextActionSingle: { actionId: "NA-1", description: "execute" },
    activeRolesAndAuthority: {},
    activeGuards: [],
    confirmedRefIndex: [{ id: "REF-RESULT-1", status: "VERIFIED", expectedVersion: "1", path: "evidence/REF-RESULT-1" }],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-10T16:00:00+09:00",
      evidenceSource: "KIRA",
    },
  };
}

function handoff() {
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
    evidenceRefIds: ["REF-HANDOFF-1"],
  };
}

function evidence() {
  return {
    resultId: "RESULT-1",
    handoffId: "HO-1",
    traceId: "TRACE-1",
    actionId: "NA-1",
    sourceStateId: "CS-1",
    sourceStateRevision: 1,
    capabilityId: "CAP-A",
    implementationId: "IMPL-1",
    executorId: "EXECUTOR-1",
    verifierId: "KIRA-1",
    outcome: "SUCCEEDED",
    providerExecutionId: "PROVIDER-1",
    observedAt: "2026-09-10T16:20:00+09:00",
    evidenceRefIds: ["REF-RESULT-1"],
    verification: "VERIFIED",
  };
}

function input() {
  return { snapshot: snapshot(), handoff: handoff(), evidence: evidence() };
}

test("1 verified succeeded result is accepted", () => {
  assert.deepEqual(evaluateExecutionResultEvidence(input()), { status: "ACCEPTED", outcome: "SUCCEEDED" });
});

test("2 verified failed result is accepted as an observed outcome", () => {
  const i = input();
  i.evidence.outcome = "FAILED";
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "ACCEPTED", outcome: "FAILED" });
});

test("3 self verification is forbidden", () => {
  const i = input();
  i.evidence.verifierId = i.evidence.executorId;
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "SELF_VERIFICATION_FORBIDDEN" });
});

test("4 conflict result holds", () => {
  const i = input();
  i.evidence.verification = "CONFLICT";
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "RESULT_CONFLICT" });
});

test("5 unverified result holds", () => {
  const i = input();
  i.evidence.verification = "UNVERIFIED";
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "UNVERIFIED_RESULT" });
});

test("6 unknown outcome can never be accepted", () => {
  const i = input();
  i.evidence.outcome = "UNKNOWN";
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "RESULT_UNKNOWN" });
});

test("7 empty result evidence refs hold", () => {
  const i = input();
  i.evidence.evidenceRefIds = [];
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "RESULT_EVIDENCE_MISSING" });
});

test("8 result evidence ref missing from confirmed index holds", () => {
  const i = input();
  i.evidence.evidenceRefIds = ["REF-NOT-FOUND"];
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "RESULT_EVIDENCE_MISSING" });
});

test("9 result evidence ref no longer verified holds", () => {
  const i = input();
  i.snapshot.confirmedRefIndex[0].status = "UNVERIFIED_REF";
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "RESULT_EVIDENCE_UNVERIFIED" });
});

test("10 independent lane not ready holds", () => {
  const i = input();
  i.snapshot.independentLaneHealth.status = "UNVERIFIED";
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "INDEPENDENT_LANE_NOT_READY" });
});

test("11 handoff identity mismatch holds", () => {
  const i = input();
  i.evidence.handoffId = "HO-OTHER";
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "HANDOFF_MISMATCH" });
});

test("12 source state mismatch holds", () => {
  const i = input();
  i.evidence.sourceStateRevision = 0;
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "STATE_MISMATCH" });
});

test("13 invalid observedAt fails closed", () => {
  const i = input();
  i.evidence.observedAt = "not-a-time";
  assert.deepEqual(evaluateExecutionResultEvidence(i), { status: "HOLD", reason: "INVALID_RESULT" });
});
