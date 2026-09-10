// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExecutionHandoff } from "../src/execution-handoff.js";

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
    gateDecision: { status: "ALLOW" },
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

test("5 changed source stateId holds", () => {
  const r = request();
  r.sourceStateId = "CS-OLD";
  assert.deepEqual(evaluateExecutionHandoff(input(), r, NOW), { status: "HOLD", reason: "STATE_CHANGED" });
});

test("6 changed source stateRevision holds", () => {
  const r = request();
  r.sourceStateRevision = 0;
  assert.deepEqual(evaluateExecutionHandoff(input(), r, NOW), { status: "HOLD", reason: "STATE_CHANGED" });
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
  assert.deepEqual(evaluateExecutionHandoff(input(), request(), "not-a-time"), { status: "HOLD", reason: "EXPIRED" });
});
