import {
  evaluateActionRoleAuthority,
  type ActionRoleAuthorityClaim,
  type ActionRoleAuthorityRequirement,
} from "./action-role-authority.js";
import type { CurrentStateSnapshot } from "./current-state.js";
import {
  evaluatePreExecutionGate,
  type PreExecutionGateDecision,
  type PreExecutionGateInput,
} from "./pre-execution-gate.js";

/**
 * AUTHORITY-BOUND PRE-EXECUTION GATE v0.1
 *
 * The caller cannot inject an AUTHORIZED decision. This boundary recomputes
 * role/authority from CURRENT and only then evaluates the existing
 * pre-execution gate. It is the strict entrypoint that the end-to-end pipeline
 * will be migrated to in the next pillar.
 */
export interface AuthorityBoundPreExecutionGateInput<T = unknown>
  extends PreExecutionGateInput<T> {
  authorityRequirement: ActionRoleAuthorityRequirement;
  authorityClaim: ActionRoleAuthorityClaim;
}

export type AuthorityBoundPreExecutionGateDecision =
  | {
      status: "ALLOW";
      actionId: string;
      stateId: string;
      stateRevision: number;
      role: string;
      actorAuthorityId: string;
    }
  | {
      status: "HOLD";
      reason: string;
    };

export function evaluateAuthorityBoundPreExecutionGate<T = unknown>(
  input: AuthorityBoundPreExecutionGateInput<T>,
): AuthorityBoundPreExecutionGateDecision {
  const authorityDecision = evaluateActionRoleAuthority(
    input.snapshot as CurrentStateSnapshot,
    input.authorityRequirement,
    input.authorityClaim,
  );

  if (authorityDecision.status !== "AUTHORIZED") {
    return { status: "HOLD", reason: authorityDecision.reason };
  }

  if (
    authorityDecision.actionId !== input.actionId ||
    authorityDecision.stateId !== input.snapshot.identity.stateId ||
    authorityDecision.stateRevision !== input.snapshot.identity.stateRevision
  ) {
    return { status: "HOLD", reason: "AUTHORITY_BINDING_MISMATCH" };
  }

  const baseDecision: PreExecutionGateDecision = evaluatePreExecutionGate(input);
  if (baseDecision.status !== "ALLOW") return baseDecision;

  return {
    ...baseDecision,
    role: authorityDecision.role,
    actorAuthorityId: authorityDecision.actorAuthorityId,
  };
}
