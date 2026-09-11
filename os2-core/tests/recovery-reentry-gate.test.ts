// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRecoveryReentryGate } from "../src/recovery-reentry-gate.js";

function snapshot() {
  return {
    identity: {
      stateId: "OS2-REENTRY-V01-STATE",
      schemaVersion: "0.1",
      stateRevision: 4,
      effectiveAt: "2026-09-11T21:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "OS2-REENTRY-V01-LINEAGE",
    },
    humanDecisionFinal: {
      decisionId: "DECISION-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "resume recovered current only after fresh re-entry verification",
    },
    mainLineTask: { taskId: "TASK-1", description: "re-enter safely" },
    nextActionSingle: { actionId: "ACTION-1", description: "continue trusted execution" },
    activeRolesAndAuthority: { SORA: "AGGREGATOR", KIRA: "INDEPENDENT_AUDIT" },
    activeGuards: [],
    confirmedRefIndex: [],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-11T20:59:00+09:00",
      evidenceSource: "KIRA-INDEPENDENT",
    },
  };
}

function baseInput() {
  const current = snapshot();
  return {
    recovery: { status: "RECOVERED", current, commitSequence: 9 },
    attestation: {
      stateId: current.identity.stateId,
      lineageId: current.identity.lineageId,
      stateRevision: current.identity.stateRevision,
      commitSequence: 9,
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-11T21:43:30+09:00",
      evidenceSource: "KIRA-INDEPENDENT-REENTRY",
    },
    now: "2026-09-11T21:44:00+09:00",
    maxAttestationAgeMs: 60_000,
    memoryDecision: {
      status: "EXECUTION_CANDIDATE",
      record: { id: "CURRENT-1", memoryClass: "CURRENT", payload: current },
    },
    actionEvidenceDecision: { status: "SATISFIED" },
  };
}

test("1 exact recovered CURRENT plus fresh bound attestation allows re-entry", () => {
  const result = evaluateRecoveryReentryGate(baseInput());
  assert.equal(result.status, "ALLOW");
  assert.equal(result.actionId, "ACTION-1");
  assert.equal(result.stateRevision, 4);
  assert.equal(result.commitSequence, 9);
  assert.equal(result.attestationSource, "KIRA-INDEPENDENT-REENTRY");
});

test("2 failed recovery cannot re-enter", () => {
  const input = baseInput();
  input.recovery = { status: "HOLD", reason: "MISSING_CURRENT" };
  assert.deepEqual(evaluateRecoveryReentryGate(input), { status: "HOLD", reason: "RECOVERY_NOT_READY" });
});

test("3 persisted CURRENT cannot self-authorize without verified attestation", () => {
  const input = baseInput();
  input.attestation.status = "HOLD";
  assert.equal(evaluateRecoveryReentryGate(input).reason, "ATTESTATION_NOT_READY");
});

test("4 attestation state substitution holds", () => {
  const input = baseInput();
  input.attestation.stateId = "FOREIGN";
  assert.equal(evaluateRecoveryReentryGate(input).reason, "ATTESTATION_BINDING_MISMATCH");
});

test("5 attestation lineage substitution holds", () => {
  const input = baseInput();
  input.attestation.lineageId = "FOREIGN-LINEAGE";
  assert.equal(evaluateRecoveryReentryGate(input).reason, "ATTESTATION_BINDING_MISMATCH");
});

test("6 attestation revision substitution holds", () => {
  const input = baseInput();
  input.attestation.stateRevision = 3;
  assert.equal(evaluateRecoveryReentryGate(input).reason, "ATTESTATION_BINDING_MISMATCH");
});

test("7 attestation commitSequence substitution holds", () => {
  const input = baseInput();
  input.attestation.commitSequence = 8;
  assert.equal(evaluateRecoveryReentryGate(input).reason, "ATTESTATION_BINDING_MISMATCH");
});

test("8 stale re-entry attestation holds", () => {
  const input = baseInput();
  input.attestation.observedAt = "2026-09-11T21:40:00+09:00";
  assert.equal(evaluateRecoveryReentryGate(input).reason, "ATTESTATION_STALE");
});

test("9 future-dated re-entry attestation holds", () => {
  const input = baseInput();
  input.attestation.observedAt = "2026-09-11T21:45:00+09:00";
  assert.equal(evaluateRecoveryReentryGate(input).reason, "ATTESTATION_FROM_FUTURE");
});

test("10 ordinary pre-execution HOLD still blocks recovered re-entry", () => {
  const input = baseInput();
  input.actionEvidenceDecision = { status: "HOLD", reason: "REQUIRED_REF_MISSING" };
  assert.deepEqual(evaluateRecoveryReentryGate(input), {
    status: "HOLD",
    reason: "PRE_EXECUTION_HOLD",
    preExecutionReason: "ACTION_EVIDENCE_NOT_SATISFIED",
  });
});
