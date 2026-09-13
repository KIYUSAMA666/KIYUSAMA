import test from "node:test";
import assert from "node:assert/strict";
import type { CurrentStateSnapshot } from "../src/current-state.js";
import { evaluateActionRoleAuthority } from "../src/action-role-authority.js";

function snapshot(): CurrentStateSnapshot {
  return {
    identity: {
      stateId: "CS-MAIN",
      schemaVersion: "0.1",
      stateRevision: 21,
      effectiveAt: "2026-09-13T10:50:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-MAIN-001",
    },
    humanDecisionFinal: {
      decisionId: "HD-ROLE-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "execute only through active role authority",
    },
    mainLineTask: { taskId: "ML-ROLE", description: "role authority integration" },
    nextActionSingle: { actionId: "ACTION-ROLE-1", description: "execute governed action" },
    activeRolesAndAuthority: {
      EXECUTION_AUTHORITY: "SORA-EXECUTOR-1",
      AUDIT_AUTHORITY: "KIRA-INDEPENDENT",
    },
    activeGuards: [],
    confirmedRefIndex: [],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-13T10:51:00+09:00",
      evidenceSource: "KIRA-INDEPENDENT",
    },
  };
}

const requirement = { actionId: "ACTION-ROLE-1", requiredRole: "EXECUTION_AUTHORITY" };
const validClaim = {
  actionId: "ACTION-ROLE-1",
  claimedRole: "EXECUTION_AUTHORITY",
  actorAuthorityId: "SORA-EXECUTOR-1",
};

test("1 exact active role authority is authorized", () => {
  assert.deepEqual(evaluateActionRoleAuthority(snapshot(), requirement, validClaim), {
    status: "AUTHORIZED",
    actionId: "ACTION-ROLE-1",
    role: "EXECUTION_AUTHORITY",
    actorAuthorityId: "SORA-EXECUTOR-1",
    stateId: "CS-MAIN",
    stateRevision: 21,
  });
});

test("2 actor cannot self-promote into an active role", () => {
  assert.deepEqual(
    evaluateActionRoleAuthority(snapshot(), requirement, {
      ...validClaim,
      actorAuthorityId: "ATTACKER",
    }),
    { status: "HOLD", reason: "AUTHORITY_MISMATCH" },
  );
});

test("3 actor cannot claim a different role", () => {
  assert.deepEqual(
    evaluateActionRoleAuthority(snapshot(), requirement, {
      ...validClaim,
      claimedRole: "AUDIT_AUTHORITY",
      actorAuthorityId: "KIRA-INDEPENDENT",
    }),
    { status: "HOLD", reason: "ROLE_MISMATCH" },
  );
});

test("4 inactive required role fails closed", () => {
  assert.deepEqual(
    evaluateActionRoleAuthority(
      snapshot(),
      { actionId: "ACTION-ROLE-1", requiredRole: "DEPLOY_AUTHORITY" },
      { actionId: "ACTION-ROLE-1", claimedRole: "DEPLOY_AUTHORITY", actorAuthorityId: "SORA-EXECUTOR-1" },
    ),
    { status: "HOLD", reason: "ROLE_NOT_ACTIVE" },
  );
});

test("5 stale or foreign action authority cannot authorize current action", () => {
  assert.deepEqual(
    evaluateActionRoleAuthority(
      snapshot(),
      { actionId: "OLD-ACTION", requiredRole: "EXECUTION_AUTHORITY" },
      { actionId: "OLD-ACTION", claimedRole: "EXECUTION_AUTHORITY", actorAuthorityId: "SORA-EXECUTOR-1" },
    ),
    { status: "HOLD", reason: "ACTION_NOT_CURRENT" },
  );
});

test("6 claim action must match requirement", () => {
  assert.deepEqual(
    evaluateActionRoleAuthority(snapshot(), requirement, {
      ...validClaim,
      actionId: "ACTION-ATTACK",
    }),
    { status: "HOLD", reason: "ACTION_MISMATCH" },
  );
});

test("7 blank requirement fails closed", () => {
  assert.deepEqual(
    evaluateActionRoleAuthority(
      snapshot(),
      { actionId: "ACTION-ROLE-1", requiredRole: " " },
      validClaim,
    ),
    { status: "HOLD", reason: "INVALID_AUTHORITY_REQUIREMENT" },
  );
});

test("8 blank actor authority fails closed", () => {
  assert.deepEqual(
    evaluateActionRoleAuthority(snapshot(), requirement, {
      ...validClaim,
      actorAuthorityId: " ",
    }),
    { status: "HOLD", reason: "INVALID_AUTHORITY_CLAIM" },
  );
});
