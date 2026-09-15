import assert from "node:assert/strict";
import test from "node:test";

import { bindBusExecutionAuthorityFromCurrent } from "../src/bus-current-authority-binding.js";
import { evaluateAuthorityBoundPreExecutionGate } from "../src/authority-bound-pre-execution-gate.js";

function snapshot() {
  return {
    identity: {
      stateId: "CS-BUS-1",
      schemaVersion: "0.1",
      stateRevision: 7,
      effectiveAt: "2026-09-15T12:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-BUS-1",
    },
    humanDecisionFinal: {
      decisionId: "HD-BUS-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "execute BUS KIRA wake",
    },
    mainLineTask: { taskId: "ML-BUS-1", description: "BUS composition" },
    nextActionSingle: { actionId: "BUS-KIRA-WAKE-1", description: "BUS to KIRA wake" },
    activeRolesAndAuthority: { EXECUTOR: "SORA-3", AUDITOR: "KIRA" },
    activeGuards: [],
    confirmedRefIndex: [],
    independentLaneHealth: {
      status: "UNVERIFIED",
      evidenceVerdict: "INSUFFICIENT",
      observedAt: null,
      evidenceSource: "KIRA",
    },
  } as any;
}

function gateInput(authorityRequirement: any, authorityClaim: any, current = snapshot()) {
  return {
    actionId: "BUS-KIRA-WAKE-1",
    snapshot: current,
    memoryDecision: {
      status: "EXECUTION_CANDIDATE",
      record: { id: "M-BUS-1", memoryClass: "CURRENT", payload: {} },
    },
    actionEvidenceDecision: { status: "SATISFIED" },
    authorityRequirement,
    authorityClaim,
  } as any;
}

test("binds BUS execution only to CURRENT active EXECUTOR authority", () => {
  const current = snapshot();
  const binding = bindBusExecutionAuthorityFromCurrent(current, "BUS-KIRA-WAKE-1");
  assert.deepEqual(binding, {
    status: "BOUND",
    authorityRequirement: { actionId: "BUS-KIRA-WAKE-1", requiredRole: "EXECUTOR" },
    authorityClaim: {
      actionId: "BUS-KIRA-WAKE-1",
      claimedRole: "EXECUTOR",
      actorAuthorityId: "SORA-3",
    },
  });
  if (binding.status !== "BOUND") assert.fail("expected BOUND");
  assert.deepEqual(
    evaluateAuthorityBoundPreExecutionGate(
      gateInput(binding.authorityRequirement, binding.authorityClaim, current),
    ),
    {
      status: "ALLOW",
      actionId: "BUS-KIRA-WAKE-1",
      stateId: "CS-BUS-1",
      stateRevision: 7,
      role: "EXECUTOR",
      actorAuthorityId: "SORA-3",
    },
  );
});

test("never derives actor authority from worker or execution_v0 vocabulary", () => {
  const current = snapshot();
  current.activeRolesAndAuthority.EXECUTOR = "SORA-CURRENT";
  const binding = bindBusExecutionAuthorityFromCurrent(current, "BUS-KIRA-WAKE-1");
  assert.equal(binding.status, "BOUND");
  if (binding.status !== "BOUND") return;
  assert.equal(binding.authorityClaim.actorAuthorityId, "SORA-CURRENT");
  assert.notEqual(binding.authorityClaim.actorAuthorityId, "WORKER-ATTACKER");
});

test("stale action fails closed", () => {
  assert.deepEqual(bindBusExecutionAuthorityFromCurrent(snapshot(), "OLD-ACTION"), {
    status: "HOLD",
    reason: "ACTION_NOT_CURRENT",
  });
});

test("missing EXECUTOR role fails closed", () => {
  const current = snapshot();
  delete current.activeRolesAndAuthority.EXECUTOR;
  assert.deepEqual(bindBusExecutionAuthorityFromCurrent(current, "BUS-KIRA-WAKE-1"), {
    status: "HOLD",
    reason: "ROLE_NOT_ACTIVE",
  });
});

test("blank CURRENT EXECUTOR authority fails closed", () => {
  const current = snapshot();
  current.activeRolesAndAuthority.EXECUTOR = " ";
  assert.deepEqual(bindBusExecutionAuthorityFromCurrent(current, "BUS-KIRA-WAKE-1"), {
    status: "HOLD",
    reason: "AUTHORITY_NOT_ACTIVE",
  });
});

test("CURRENT authority change is re-derived and accepted only as the new authority", () => {
  const current = snapshot();
  current.activeRolesAndAuthority.EXECUTOR = "SORA-5";
  const binding = bindBusExecutionAuthorityFromCurrent(current, "BUS-KIRA-WAKE-1");
  assert.equal(binding.status, "BOUND");
  if (binding.status !== "BOUND") return;
  assert.equal(binding.authorityClaim.actorAuthorityId, "SORA-5");
  assert.deepEqual(
    evaluateAuthorityBoundPreExecutionGate(
      gateInput(binding.authorityRequirement, binding.authorityClaim, current),
    ),
    {
      status: "ALLOW",
      actionId: "BUS-KIRA-WAKE-1",
      stateId: "CS-BUS-1",
      stateRevision: 7,
      role: "EXECUTOR",
      actorAuthorityId: "SORA-5",
    },
  );
});
