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

function snapshotAtomicCommit(commit: WriteBackAtomicCommit): WriteBackAtomicCommit {
  return JSON.parse(JSON.stringify(commit)) as WriteBackAtomicCommit;
}

/**
 * Trust validation happens before authority consumption. Once the pipeline is
 * READY_TO_COMMIT, the verified commit is deep-snapshotted before the backend
 * is observed, then the existing lease validator is used with a claim backend
 * whose single operation is authority-claim + commit atomically.
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

  // Snapshot before reading backend to preserve the trusted-commit TOCTOU rule.
  const verifiedCommit = snapshotAtomicCommit(pipelineDecision.atomicCommit);
  const backend = input.backend;
  let committedSequence: number | null = null;
  let commitRejectedReason: string | null = null;

  const atomicClaimBackend: ReentryAuthorityLeaseClaimBackend = {
    async claimExactLease(claimInput) {
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
    lease: input.lease,
    request: input.request,
    now: input.now,
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
    return {
      status: "HOLD",
      stage: "AUTHORITY",
      reason: authorityDecision.reason,
    };
  }

  if (committedSequence === null || !Number.isInteger(committedSequence) || committedSequence < 0) {
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
