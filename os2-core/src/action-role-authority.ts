import type { CurrentStateSnapshot } from "./current-state.js";

/**
 * ACTION ROLE / AUTHORITY v0.1
 *
 * Resolves one execution actor against the active role map stored in CURRENT.
 * This module does not create or mutate authority. It only answers whether an
 * already-declared actor is the exact authority currently assigned to the role
 * required by the current action.
 */
export interface ActionRoleAuthorityRequirement {
  actionId: string;
  requiredRole: string;
}

export interface ActionRoleAuthorityClaim {
  actionId: string;
  claimedRole: string;
  actorAuthorityId: string;
}

export type ActionRoleAuthorityHoldReason =
  | "INVALID_AUTHORITY_REQUIREMENT"
  | "INVALID_AUTHORITY_CLAIM"
  | "ACTION_NOT_CURRENT"
  | "ACTION_MISMATCH"
  | "ROLE_MISMATCH"
  | "ROLE_NOT_ACTIVE"
  | "AUTHORITY_MISMATCH";

export type ActionRoleAuthorityDecision =
  | {
      status: "AUTHORIZED";
      actionId: string;
      role: string;
      actorAuthorityId: string;
      stateId: string;
      stateRevision: number;
    }
  | { status: "HOLD"; reason: ActionRoleAuthorityHoldReason };

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function evaluateActionRoleAuthority(
  snapshot: CurrentStateSnapshot,
  requirement: ActionRoleAuthorityRequirement,
  claim: ActionRoleAuthorityClaim,
): ActionRoleAuthorityDecision {
  if (!nonEmpty(requirement.actionId) || !nonEmpty(requirement.requiredRole)) {
    return { status: "HOLD", reason: "INVALID_AUTHORITY_REQUIREMENT" };
  }

  if (!nonEmpty(claim.actionId) || !nonEmpty(claim.claimedRole) || !nonEmpty(claim.actorAuthorityId)) {
    return { status: "HOLD", reason: "INVALID_AUTHORITY_CLAIM" };
  }

  if (requirement.actionId !== snapshot.nextActionSingle.actionId) {
    return { status: "HOLD", reason: "ACTION_NOT_CURRENT" };
  }

  if (claim.actionId !== requirement.actionId) {
    return { status: "HOLD", reason: "ACTION_MISMATCH" };
  }

  if (claim.claimedRole !== requirement.requiredRole) {
    return { status: "HOLD", reason: "ROLE_MISMATCH" };
  }

  const activeAuthorityId = snapshot.activeRolesAndAuthority[requirement.requiredRole];
  if (typeof activeAuthorityId !== "string" || !nonEmpty(activeAuthorityId)) {
    return { status: "HOLD", reason: "ROLE_NOT_ACTIVE" };
  }

  if (claim.actorAuthorityId !== activeAuthorityId) {
    return { status: "HOLD", reason: "AUTHORITY_MISMATCH" };
  }

  return {
    status: "AUTHORIZED",
    actionId: requirement.actionId,
    role: requirement.requiredRole,
    actorAuthorityId: claim.actorAuthorityId,
    stateId: snapshot.identity.stateId,
    stateRevision: snapshot.identity.stateRevision,
  };
}
