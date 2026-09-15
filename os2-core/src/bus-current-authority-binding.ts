import type { CurrentStateSnapshot } from "./current-state.js";
import type {
  ActionAuthorityClaim,
  ActionAuthorityRequirement,
} from "./action-role-authority.js";

export type BusCurrentAuthorityBindingDecision =
  | {
      status: "BOUND";
      authorityRequirement: ActionAuthorityRequirement;
      authorityClaim: ActionAuthorityClaim;
    }
  | {
      status: "HOLD";
      reason:
        | "ACTION_NOT_CURRENT"
        | "ROLE_NOT_ACTIVE"
        | "AUTHORITY_NOT_ACTIVE";
    };

/**
 * Minimal authority bridge for BUS execution.
 *
 * Policy decision: BUS execution uses CURRENT's active EXECUTOR role.
 * Neither worker identity nor execution_v0 metadata is allowed to invent or
 * substitute the actor authority. Both the required role and actor authority
 * are derived from the fresh CURRENT snapshot and are then re-verified by
 * evaluateAuthorityBoundPreExecutionGate().
 */
export function bindBusExecutionAuthorityFromCurrent(
  snapshot: CurrentStateSnapshot,
  actionId: string,
): BusCurrentAuthorityBindingDecision {
  if (
    typeof actionId !== "string" ||
    actionId.trim().length === 0 ||
    snapshot.nextActionSingle.actionId !== actionId
  ) {
    return { status: "HOLD", reason: "ACTION_NOT_CURRENT" };
  }

  const role = "EXECUTOR";
  if (!Object.prototype.hasOwnProperty.call(snapshot.activeRolesAndAuthority, role)) {
    return { status: "HOLD", reason: "ROLE_NOT_ACTIVE" };
  }

  const actorAuthorityId = snapshot.activeRolesAndAuthority[role];
  if (typeof actorAuthorityId !== "string" || actorAuthorityId.trim().length === 0) {
    return { status: "HOLD", reason: "AUTHORITY_NOT_ACTIVE" };
  }

  return {
    status: "BOUND",
    authorityRequirement: {
      actionId,
      requiredRole: role,
    },
    authorityClaim: {
      actionId,
      claimedRole: role,
      actorAuthorityId,
    },
  };
}
