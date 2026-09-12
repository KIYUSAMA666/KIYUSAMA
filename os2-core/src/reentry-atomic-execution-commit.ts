import {
  evaluateEndToEndTrustPipeline,
  type EndToEndTrustPipelineInput,
} from "./end-to-end-trust-pipeline.js";
import {
  consumeReentryAuthorityLease,
  type ReentryAuthorityExecutionRequest,
  type ReentryAuthorityLease,
  type ReentryAuthorityLeaseClaimBackend,
} from "./reentry-authority-lease.js";
import type { WriteBackAtomicCommit } from "./write-back.js";

/**
 * RE-ENTRY ATOMIC EXECUTION COMMIT v0.1
 *
 * Closes the seam between one-time re-entry authority consumption and the
 * trusted storage commit. The backend operation represented here MUST claim
 * the underlying authorityKey and apply the verified atomic commit in one
 * database transaction. If either side cannot commit, neither side may remain.
 */

export interface ReentryAtomicExecutionCommitBackend {
  claimAuthorityAndCommit(input: {
    lease: ReentryAuthorityLease;
    request: ReentryAuthorityExecutionRequest;
    claimedAt: string;
    atomicCommit: WriteBackAtomicCommit;
  }): Promise<
    | { status: "COMMITTED"; commitSequence: number }
    | { status: "ALREADY_CONSUMED" }
    | { status: "BINDING_MISMATCH" }
    | { status: "COMMIT_REJECTED"; reason: string }
  >;
}

export type ReentryAtomicExecutionCommitDecision =
  | { status: "COMMITTED"; commitSequence: number; authorityKey: string }
  | {
      status: "HOLD";
      stage: "TRUST_PIPELINE" | "AUTHORITY" | "ATOMIC_COMMIT";
      reason: string;
      pipelineStage?: string;
    };

export interface ReentryAtomicExecutionCommitInput<T = unknown> {
  pipeline: EndToEndTrustPipelineInput<T>;
  lease: ReentryAuthorityLease;
  request: ReentryAuthorityExecutionRequest;
  now: string;
  backend: ReentryAtomicExecutionCommitBackend;
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPipelineLeaseBindingExact<T>(
  pipeline: EndToEndTrustPipelineInput<T>,
  lease: ReentryAuthorityLease,
  atomicCommit: WriteBackAtomicCommit,
): boolean {
  return (
    lease.actionId === pipeline.handoff.actionId &&
    lease.actionId === pipeline.actionEvidenceRequirement.actionId &&
    lease.stateId === pipeline.snapshot.identity.stateId &&
    lease.stateRevision === pipeline.snapshot.identity.stateRevision &&
    atomicCommit.expectedCurrent.expectedCurrentStateId === lease.stateId &&
    atomicCommit.expectedCurrent.expectedCurrentRevision === lease.stateRevision
  );
}

/**
 * Trust validation happens before authority consumption. Once the pipeline is
 * READY_TO_COMMIT, the verified commit plus lease/request are snapshotted before
 * the backend is observed. This preserves the existing trusted-commit TOCTOU
 * rule and also prevents a hostile backend getter from swapping authority input.
 *
 * The local binding check closes a cross-action/state substitution seam: a valid
 * lease for one recovered action/state cannot authorize a different verified
 * pipeline commit. The database backend must additionally re-check CURRENT
 * state/revision/commitSequence and perform authority claim + result/handoff
 * consumption + CURRENT swap in one transaction.
 */
export async function executeReentryAtomicExecutionCommit<T = unknown>(
  input: ReentryAtomicExecutionCommitInput<T>,
): Promise<ReentryAtomicExecutionCommitDecision> {
  const pipelineDecision = evaluateEndToEndTrustPipeline(input.pipeline);
  if (pipelineDecision.status !== "READY_TO_COMMIT") {
    return {
      status: "HOLD",
      stage: "TRUST_PIPELINE",
      pipelineStage: pipelineDecision.stage,
      reason: pipelineDecision.reason,
    };
  }

  const verifiedCommit = snapshot(pipelineDecision.atomicCommit);
  const verifiedLease = snapshot(input.lease);
  const verifiedRequest = snapshot(input.request);
  const verifiedNow = input.now;

  if (!isPipelineLeaseBindingExact(input.pipeline, verifiedLease, verifiedCommit)) {
    return {
      status: "HOLD",
      stage: "AUTHORITY",
      reason: "PIPELINE_LEASE_BINDING_MISMATCH",
    };
  }

  // Access backend only after all trusted inputs needed for the backend call are
  // snapshotted. Caller-controlled getters cannot mutate what reaches storage.
  const backend = input.backend;
  let committedSequence: number | null = null;
  let commitRejectedReason: string | null = null;
  let backendInvoked = false;

  const atomicClaimBackend: ReentryAuthorityLeaseClaimBackend = {
    async claimExactLease(claimInput) {
      backendInvoked = true;
      const result = await backend.claimAuthorityAndCommit({
        ...claimInput,
        atomicCommit: verifiedCommit,
      });
      if (result.status === "COMMITTED") {
        committedSequence = result.commitSequence;
        return { status: "CLAIMED" };
      }
      if (result.status === "ALREADY_CONSUMED") {
        return { status: "ALREADY_CONSUMED" };
      }
      if (result.status === "BINDING_MISMATCH") {
        return { status: "BINDING_MISMATCH" };
      }
      commitRejectedReason = result.reason;
      throw new Error("atomic commit rejected");
    },
  };

  const authorityDecision = await consumeReentryAuthorityLease({
    lease: verifiedLease,
    request: verifiedRequest,
    now: verifiedNow,
    backend: atomicClaimBackend,
  });

  if (authorityDecision.status !== "ALLOW_EXECUTION") {
    if (commitRejectedReason !== null) {
      return {
        status: "HOLD",
        stage: "ATOMIC_COMMIT",
        reason: commitRejectedReason,
      };
    }
    if (
      backendInvoked &&
      authorityDecision.reason === "LEASE_CLAIM_BACKEND_FAILURE"
    ) {
      return {
        status: "HOLD",
        stage: "ATOMIC_COMMIT",
        reason: "BACKEND_FAILURE",
      };
    }
    return {
      status: "HOLD",
      stage: "AUTHORITY",
      reason: authorityDecision.reason,
    };
  }

  if (
    committedSequence === null ||
    !Number.isInteger(committedSequence) ||
    committedSequence < 0
  ) {
    return {
      status: "HOLD",
      stage: "ATOMIC_COMMIT",
      reason: "BACKEND_PROTOCOL_FAILURE",
    };
  }

  return {
    status: "COMMITTED",
    commitSequence: committedSequence,
    authorityKey: authorityDecision.authorityKey,
  };
}
