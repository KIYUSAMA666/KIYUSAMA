import type { RecoveryReentryGateDecision } from "./recovery-reentry-gate.js";

export interface ReentryAuthorityLease {
  leaseId: string;
  authorityKey: string;
  actionId: string;
  stateId: string;
  stateRevision: number;
  commitSequence: number;
  attestationId: string | null;
  attestationObservedAt: string;
  attestationSource: string;
  reentryAuthorityExpiresAt: string;
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
        | "LEASE_TIME_INVALID"
        | "REENTRY_AUTHORITY_EXPIRED"
        | "LEASE_EXCEEDS_REENTRY_WINDOW";
    };

export interface ReentryAuthorityExecutionRequest {
  leaseId: string;
  authorityKey: string;
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
      authorityKey: string;
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
        | "REENTRY_AUTHORITY_EXPIRED"
        | "LEASE_ALREADY_CONSUMED"
        | "LEASE_CLAIM_BACKEND_FAILURE";
    };

function parseFiniteTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildAuthorityKey(input: {
  actionId: string;
  stateId: string;
  stateRevision: number;
  commitSequence: number;
  attestationId: string | null;
  attestationObservedAt: string;
  attestationSource: string;
}): string {
  return JSON.stringify([
    "OS2_REENTRY_AUTHORITY_V01",
    input.actionId,
    input.stateId,
    input.stateRevision,
    input.commitSequence,
    input.attestationId,
    input.attestationObservedAt,
    input.attestationSource,
  ]);
}

/**
 * Converts a successful recovery re-entry decision into a short-lived authority
 * lease. A stored ALLOW cannot mint authority after the original re-entry freshness
 * deadline, and the resulting lease cannot extend beyond that deadline.
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
  const authorityExpiresAtMs = parseFiniteTime(
    input.reentryDecision.reentryAuthorityExpiresAt,
  );
  if (
    issuedAtMs === null ||
    attestationObservedAtMs === null ||
    authorityExpiresAtMs === null ||
    authorityExpiresAtMs < attestationObservedAtMs
  ) {
    return { status: "HOLD", reason: "LEASE_TIME_INVALID" };
  }
  if (attestationObservedAtMs > issuedAtMs) {
    return { status: "HOLD", reason: "LEASE_TIME_INVALID" };
  }
  if (issuedAtMs >= authorityExpiresAtMs) {
    return { status: "HOLD", reason: "REENTRY_AUTHORITY_EXPIRED" };
  }

  const expiresAtMs = issuedAtMs + input.ttlMs;
  if (!Number.isFinite(expiresAtMs)) {
    return { status: "HOLD", reason: "LEASE_TIME_INVALID" };
  }
  if (expiresAtMs > authorityExpiresAtMs) {
    return { status: "HOLD", reason: "LEASE_EXCEEDS_REENTRY_WINDOW" };
  }

  const authorityKey = buildAuthorityKey({
    actionId: input.reentryDecision.actionId,
    stateId: input.reentryDecision.stateId,
    stateRevision: input.reentryDecision.stateRevision,
    commitSequence: input.reentryDecision.commitSequence,
    attestationId: input.reentryDecision.attestationId,
    attestationObservedAt: input.reentryDecision.attestationObservedAt,
    attestationSource: input.reentryDecision.attestationSource,
  });

  return {
    status: "ISSUED",
    lease: {
      leaseId: input.leaseId,
      authorityKey,
      actionId: input.reentryDecision.actionId,
      stateId: input.reentryDecision.stateId,
      stateRevision: input.reentryDecision.stateRevision,
      commitSequence: input.reentryDecision.commitSequence,
      attestationId: input.reentryDecision.attestationId,
      attestationObservedAt: input.reentryDecision.attestationObservedAt,
      attestationSource: input.reentryDecision.attestationSource,
      reentryAuthorityExpiresAt: input.reentryDecision.reentryAuthorityExpiresAt,
      issuedAt: input.issuedAt,
      expiresAt: new Date(expiresAtMs).toISOString(),
    },
  };
}

/**
 * One-time execution authority is granted only after an atomic exact-binding
 * claim succeeds. The replay/concurrency boundary is the underlying authorityKey,
 * not caller-chosen leaseId, so multiple leaseIds minted from the same re-entry
 * authority still permit at most one successful execution.
 */
export async function consumeReentryAuthorityLease(input: {
  lease: ReentryAuthorityLease;
  request: ReentryAuthorityExecutionRequest;
  now: string;
  backend: ReentryAuthorityLeaseClaimBackend;
}): Promise<ReentryAuthorityLeaseConsumeDecision> {
  const { lease, request } = input;

  const expectedAuthorityKey = buildAuthorityKey({
    actionId: lease.actionId,
    stateId: lease.stateId,
    stateRevision: lease.stateRevision,
    commitSequence: lease.commitSequence,
    attestationId: lease.attestationId,
    attestationObservedAt: lease.attestationObservedAt,
    attestationSource: lease.attestationSource,
  });

  if (
    lease.authorityKey !== expectedAuthorityKey ||
    request.leaseId !== lease.leaseId ||
    request.authorityKey !== lease.authorityKey ||
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
  const authorityExpiresAtMs = parseFiniteTime(lease.reentryAuthorityExpiresAt);
  const observedAtMs = parseFiniteTime(lease.attestationObservedAt);
  if (
    nowMs === null ||
    issuedAtMs === null ||
    expiresAtMs === null ||
    authorityExpiresAtMs === null ||
    observedAtMs === null ||
    authorityExpiresAtMs < observedAtMs ||
    issuedAtMs < observedAtMs ||
    expiresAtMs <= issuedAtMs ||
    expiresAtMs > authorityExpiresAtMs
  ) {
    return { status: "HOLD", reason: "LEASE_TIME_INVALID" };
  }
  if (nowMs < issuedAtMs) {
    return { status: "HOLD", reason: "LEASE_NOT_YET_VALID" };
  }
  if (nowMs >= authorityExpiresAtMs) {
    return { status: "HOLD", reason: "REENTRY_AUTHORITY_EXPIRED" };
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
    authorityKey: lease.authorityKey,
    actionId: lease.actionId,
    stateId: lease.stateId,
    stateRevision: lease.stateRevision,
    commitSequence: lease.commitSequence,
    claimedAt: input.now,
  };
}
