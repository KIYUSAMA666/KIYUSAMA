// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePreExecutionGate } from "../src/pre-execution-gate.js";

function snapshot() {
  return {
    identity: {
      stateId: "CS-1",
      schemaVersion: "0.1",
      stateRevision: 1,
      effectiveAt: "2026-09-09T08:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-MAIN-001",
    },
    humanDecisionFinal: {
      decisionId: "HD-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "test",
    },
    mainLineTask: { taskId: "ML-1", description: "test" },
    nextActionSingle: { actionId: "NA-1", description: "test" },
    activeRolesAndAuthority: {},
    activeGuards: [],
    confirmedRefIndex: [],
    independentLaneHealth: {
      status: "UNVERIFIED",
      evidenceVerdict: "INSUFFICIENT",
      observedAt: null,
      evidenceSource: "KIRA",
    },
  };
}

function currentMemoryDecision() {
  return {
    status: "EXECUTION_CANDIDATE",
    record: { id: "M-1", memoryClass: "CURRENT", payload: {} },
  };
}

function satisfiedActionEvidenceDecision() {
  return { status: "SATISFIED" };
}

function baseInput() {
  return {
    actionId: "NA-1",
    snapshot: snapshot(),
    memoryDecision: currentMemoryDecision(),
    actionEvidenceDecision: satisfiedActionEvidenceDecision(),
  };
}

test("1 normal conditions with satisfied action evidence allow", () => {
  assert.deepEqual(evaluatePreExecutionGate(baseInput()), { status: "ALLOW" });
});

test("2 non-current action holds", () => {
  const input = baseInput();
  input.actionId = "NA-OTHER";
  assert.deepEqual(evaluatePreExecutionGate(input), { status: "HOLD", reason: "ACTION_NOT_CURRENT" });
});

test("3 non-current memory holds", () => {
  const input = baseInput();
  input.memoryDecision = { status: "NOT_EXECUTABLE", reason: "NON_CURRENT_MEMORY" };
  assert.deepEqual(evaluatePreExecutionGate(input), { status: "HOLD", reason: "NON_CURRENT_MEMORY" });
});

test("4 unverified active guard holds", () => {
  const input = baseInput();
  input.snapshot.activeGuards = [{ guardId: "G-1", rule: "must be verified", refConfirmed: "UNVERIFIED_REF" }];
  assert.deepEqual(evaluatePreExecutionGate(input), { status: "HOLD", reason: "UNVERIFIED_ACTIVE_GUARD" });
});

test("5 unsatisfied action evidence holds", () => {
  const input = baseInput();
  input.actionEvidenceDecision = { status: "HOLD", reason: "REQUIRED_REF_MISSING", refId: "REF-1" };
  assert.deepEqual(evaluatePreExecutionGate(input), { status: "HOLD", reason: "ACTION_EVIDENCE_NOT_SATISFIED" });
});

test("6 required capability not ready holds", () => {
  const input = {
    ...baseInput(),
    requiredCapabilityId: "CAP-A",
    capabilitySlot: { slotId: "S-1", capabilityId: "CAP-A", status: "EMPTY", binding: null },
  };
  assert.deepEqual(evaluatePreExecutionGate(input), { status: "HOLD", reason: "CAPABILITY_NOT_READY" });
});

test("7 required capability mismatch holds", () => {
  const input = {
    ...baseInput(),
    requiredCapabilityId: "CAP-A",
    capabilitySlot: {
      slotId: "S-1",
      capabilityId: "CAP-B",
      status: "BOUND",
      binding: {
        capabilityId: "CAP-B",
        implementationId: "IMPL-1",
        source: "NATIVE",
        version: "1",
        verified: true,
      },
    },
  };
  assert.deepEqual(evaluatePreExecutionGate(input), { status: "HOLD", reason: "CAPABILITY_MISMATCH" });
});

test("8 verified bound matching capability with satisfied action evidence allows", () => {
  const input = {
    ...baseInput(),
    requiredCapabilityId: "CAP-A",
    capabilitySlot: {
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
    },
  };
  assert.deepEqual(evaluatePreExecutionGate(input), { status: "ALLOW" });
});
