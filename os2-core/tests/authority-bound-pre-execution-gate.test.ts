// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAuthorityBoundPreExecutionGate } from "../src/authority-bound-pre-execution-gate.js";

function snapshot() {
  return {
    identity: {
      stateId: "CS-1", schemaVersion: "0.1", stateRevision: 1,
      effectiveAt: "2026-09-13T10:00:00+09:00", scope: "KIYUSAMA_OS_2", lineageId: "LINEAGE-1",
    },
    humanDecisionFinal: { decisionId: "HD-1", sourceAuthority: "KIYUSAMA", shortDirective: "execute" },
    mainLineTask: { taskId: "ML-1", description: "test" },
    nextActionSingle: { actionId: "NA-1", description: "test" },
    activeRolesAndAuthority: { EXECUTOR: "SORA-3" },
    activeGuards: [],
    confirmedRefIndex: [],
    independentLaneHealth: {
      status: "UNVERIFIED", evidenceVerdict: "INSUFFICIENT", observedAt: null, evidenceSource: "KIRA",
    },
  };
}

function baseInput() {
  return {
    actionId: "NA-1",
    snapshot: snapshot(),
    memoryDecision: {
      status: "EXECUTION_CANDIDATE",
      record: { id: "M-1", memoryClass: "CURRENT", payload: {} },
    },
    actionEvidenceDecision: { status: "SATISFIED" },
    authorityRequirement: { actionId: "NA-1", requiredRole: "EXECUTOR" },
    authorityClaim: { actionId: "NA-1", claimedRole: "EXECUTOR", actorAuthorityId: "SORA-3" },
  };
}

test("1 valid CURRENT role and actor allow with authority binding", () => {
  assert.deepEqual(evaluateAuthorityBoundPreExecutionGate(baseInput()), {
    status: "ALLOW",
    actionId: "NA-1",
    stateId: "CS-1",
    stateRevision: 1,
    role: "EXECUTOR",
    actorAuthorityId: "SORA-3",
  });
});

test("2 self-promotion attacker is rejected", () => {
  const input = baseInput();
  input.authorityClaim.actorAuthorityId = "ATTACKER";
  assert.deepEqual(evaluateAuthorityBoundPreExecutionGate(input), {
    status: "HOLD", reason: "AUTHORITY_MISMATCH",
  });
});

test("3 role substitution is rejected", () => {
  const input = baseInput();
  input.authorityClaim.claimedRole = "AUDITOR";
  assert.deepEqual(evaluateAuthorityBoundPreExecutionGate(input), {
    status: "HOLD", reason: "ROLE_MISMATCH",
  });
});

test("4 inactive role is rejected", () => {
  const input = baseInput();
  input.authorityRequirement.requiredRole = "AUDITOR";
  input.authorityClaim.claimedRole = "AUDITOR";
  assert.deepEqual(evaluateAuthorityBoundPreExecutionGate(input), {
    status: "HOLD", reason: "ROLE_NOT_ACTIVE",
  });
});

test("5 stale action is rejected before normal pre-execution allow", () => {
  const input = baseInput();
  input.authorityRequirement.actionId = "NA-OLD";
  input.authorityClaim.actionId = "NA-OLD";
  assert.deepEqual(evaluateAuthorityBoundPreExecutionGate(input), {
    status: "HOLD", reason: "ACTION_NOT_CURRENT",
  });
});

test("6 correct authority cannot bypass a failed normal gate", () => {
  const input = baseInput();
  input.actionEvidenceDecision = { status: "HOLD", reason: "REQUIRED_REF_MISSING" };
  assert.deepEqual(evaluateAuthorityBoundPreExecutionGate(input), {
    status: "HOLD", reason: "ACTION_EVIDENCE_NOT_SATISFIED",
  });
});

test("7 authority is recomputed from CURRENT, not caller decision", () => {
  const input = baseInput();
  input.snapshot.activeRolesAndAuthority.EXECUTOR = "SORA-5";
  assert.deepEqual(evaluateAuthorityBoundPreExecutionGate(input), {
    status: "HOLD", reason: "AUTHORITY_MISMATCH",
  });
});

test("8 blank actor fails closed", () => {
  const input = baseInput();
  input.authorityClaim.actorAuthorityId = " ";
  assert.deepEqual(evaluateAuthorityBoundPreExecutionGate(input), {
    status: "HOLD", reason: "INVALID_AUTHORITY_CLAIM",
  });
});
