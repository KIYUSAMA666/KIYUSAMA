import type { RecoveryReentryGateDecision } from "./recovery-reentry-gate.js";

export interface ReentryAuthorityLease {
  leaseId: string;
  actionId: string;
  stateId: string;
  stateRevision: number;
  commitSequence: number;
  attestationObservedAt: string;
  attestationSource: string;
  issuedAt: string;
  expiresAt: string;
}

export type ReentryAuthorityLeaseIssueDecision =
  | { status: "ISSUED"; lease: ReentryAuthorityLease }
  | {
      status: "HOLD";
      reason:
        | "REENTRY_NOT_ALLOWED"
        | "LEASE_ID_INVALID"
        | "LEASE_TTL_INVALID"
        | "LEASE_TIME_INVALID";
    };

export interface ReentryAuthorityExecutionRequest {
  leaseId: string;
  actionId: string;
  stateId: string;
  stateRevision: number;
  commitSequence: number;
}

export interface ReentryAuthorityLeaseClaimBackend {
  claimExactLease(input: {
    lease: ReentryAuthorityLease;
    request: ReentryAuthorityExecutionRequest;
    claimedAt: string;
  }): Promise<
    | { status: "CLAIMED" }
    | { status: "ALREADY_CONSUMED" }
    | { status: "BINDING_MISMATCH" }
  >;
}

export type ReentryAuthorityLeaseConsumeDecision =
  | {
      status: "ALLOW_EXECUTION";
      leaseId: string;
      actionId: string;
      stateId: string;
      stateRevision: number;
      commitSequence: number;
      claimedAt: string;
    }
  | {
      status: "HOLD";
      reason:
        | "LEASE_BINDING_MISMATCH"
        | "LEASE_TIME_INVALID"
        | "LEASE_NOT_YET_VALID"
        | "LEASE_EXPIRED"
        | "LEASE_ALREADY_CONSUMED"
        | "LEASE_CLAIM_BACKEND_FAILURE";
    };

function parseFiniteTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converts a successful recovery re-entry decision into a short-lived authority
 * lease. The lease itself is not executable authority until it is atomically
 * claimed by the consumption backend.
 */
export function issueReentryAuthorityLease(input: {
  leaseId: string;
  reentryDecision: RecoveryReentryGateDecision;
  issuedAt: string;
  ttlMs: number;
}): ReentryAuthorityLeaseIssueDecision {
  if (input.reentryDecision.status !== "ALLOW") {
    return { status: "HOLD", reason: "REENTRY_NOT_ALLOWED" };
  }
  if (!input.leaseId.trim()) {
    return { status: "HOLD", reason: "LEASE_ID_INVALID" };
  }
  if (!Number.isInteger(input.ttlMs) || input.ttlMs <= 0) {
    return { status: "HOLD", reason: "LEASE_TTL_INVALID" };
  }

  const issuedAtMs = parseFiniteTime(input.issuedAt);
  const attestationObservedAtMs = parseFiniteTime(
    input.reentryDecision.attestationObservedAt,
  );
  if (issuedAtMs === null || attestationObservedAtMs === null) {
    return { status: "HOLD", reason: "LEASE_TIME_INVALID" };
  }
  if (attestationObservedAtMs > issuedAtMs) {
    return { status: "HOLD", reason: "LEASE_TIME_INVALID" };
  }

  const expiresAtMs = issuedAtMs + input.ttlMs;
  if (!Number.isFinite(expiresAtMs)) {
    return { status: "HOLD", reason: "LEASE_TIME_INVALID" };
  }

  return {
    status: "ISSUED",
    lease: {
      leaseId: input.leaseId,
      actionId: input.reentryDecision.actionId,
      stateId: input.reentryDecision.stateId,
      stateRevision: input.reentryDecision.stateRevision,
      commitSequence: input.reentryDecision.commitSequence,
      attestationObservedAt: input.reentryDecision.attestationObservedAt,
      attestationSource: input.reentryDecision.attestationSource,
      issuedAt: input.issuedAt,
      expiresAt: new Date(expiresAtMs).toISOString(),
    },
  };
}

/**
 * One-time execution authority is granted only after an atomic exact-binding
 * claim succeeds. Validation before the claim is advisory defense; the backend
 * claim is the replay/concurrency boundary and must implement claim-once
 * semantics atomically for leaseId + action/state/revision/commitSequence.
 */
export async function consumeReentryAuthorityLease(input: {
  lease: ReentryAuthorityLease;
  request: ReentryAuthorityExecutionRequest;
  now: string;
  backend: ReentryAuthorityLeaseClaimBackend;
}): Promise<ReentryAuthorityLeaseConsumeDecision> {
  const { lease, request } = input;

  if (
    request.leaseId !== lease.leaseId ||
    request.actionId !== lease.actionId ||
    request.stateId !== lease.stateId ||
    request.stateRevision !== lease.stateRevision ||
    request.commitSequence !== lease.commitSequence
  ) {
    return { status: "HOLD", reason: "LEASE_BINDING_MISMATCH" };
  }

  const nowMs = parseFiniteTime(input.now);
  const issuedAtMs = parseFiniteTime(lease.issuedAt);
  const expiresAtMs = parseFiniteTime(lease.expiresAt);
  if (nowMs === null || issuedAtMs === null || expiresAtMs === null) {
    return { status: "HOLD", reason: "LEASE_TIME_INVALID" };
  }
  if (expiresAtMs <= issuedAtMs) {
    return { status: "HOLD", reason: "LEASE_TIME_INVALID" };
  }
  if (nowMs < issuedAtMs) {
    return { status: "HOLD", reason: "LEASE_NOT_YET_VALID" };
  }
  if (nowMs >= expiresAtMs) {
    return { status: "HOLD", reason: "LEASE_EXPIRED" };
  }

  let claim:
    | { status: "CLAIMED" }
    | { status: "ALREADY_CONSUMED" }
    | { status: "BINDING_MISMATCH" };
  try {
    claim = await input.backend.claimExactLease({
      lease,
      request,
      claimedAt: input.now,
    });
  } catch {
    return { status: "HOLD", reason: "LEASE_CLAIM_BACKEND_FAILURE" };
  }

  if (claim.status === "ALREADY_CONSUMED") {
    return { status: "HOLD", reason: "LEASE_ALREADY_CONSUMED" };
  }
  if (claim.status === "BINDING_MISMATCH") {
    return { status: "HOLD", reason: "LEASE_BINDING_MISMATCH" };
  }

  return {
    status: "ALLOW_EXECUTION",
    leaseId: lease.leaseId,
    actionId: lease.actionId,
    stateId: lease.stateId,
    stateRevision: lease.stateRevision,
    commitSequence: lease.commitSequence,
    claimedAt: input.now,
  };
}
