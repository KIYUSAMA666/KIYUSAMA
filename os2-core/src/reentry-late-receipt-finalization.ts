import {
  evaluateEndToEndTrustPipeline,
  type EndToEndTrustPipelineInput,
} from "./end-to-end-trust-pipeline.js";
import type { ReentryAuthorityLease } from "./reentry-authority-lease.js";
import {
  recoverReentryAtomicCommitOutcome,
  type ReentryDurableCommitReceiptBackend,
} from "./reentry-durable-commit-receipt.js";
import type { ReentryReconciledCommitDecision } from "./reentry-ambiguous-outcome-reconciliation.js";
import type { WriteBackAtomicCommit } from "./write-back.js";

/**
 * RE-ENTRY LATE RECEIPT FINALIZATION v0.1
 *
 * The first reconciliation pass may safely end in UNKNOWN_OUTCOME when the
 * atomic RPC threw and the durable receipt is not visible yet (or the receipt
 * backend is temporarily unavailable). That state must NEVER cause a commit
 * retry. This layer provides the only follow-up operation: re-read the durable
 * receipt against the same verified lease + atomic-commit binding and converge
 * UNKNOWN_OUTCOME to COMMITTED only when exact durable proof appears.
 *
 * There is intentionally no commit backend in this API.
 */

export type ReentryLateReceiptFinalizationDecision =
  | {
      status: "COMMITTED";
      source: "LATE_DURABLE_RECEIPT";
      commitSequence: number;
      authorityKey: string;
      committedAt: string;
    }
  | {
      status: "UNKNOWN_OUTCOME";
      reason: "RECEIPT_NOT_FOUND" | "RECEIPT_BACKEND_FAILURE";
      authorityKey: string;
      retryDisposition: "DO_NOT_RETRY";
    }
  | {
      status: "HOLD";
      stage: "OUTCOME_FINALIZATION";
      reason:
        | "PRIOR_DECISION_NOT_UNKNOWN"
        | "PRIOR_UNKNOWN_BINDING_MISMATCH"
        | "VERIFIED_ATOMIC_COMMIT_UNAVAILABLE"
        | "RECEIPT_BINDING_MISMATCH"
        | "RECEIPT_PROTOCOL_FAILURE";
      retryDisposition: "DO_NOT_RETRY";
    };

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Low-level finalizer for an already-derived verified atomic commit.
 *
 * It will not even read the receipt unless the prior state is UNKNOWN_OUTCOME
 * for the exact same authority key. It never calls any commit primitive.
 */
export async function finalizeObservedReentryUnknownOutcome(input: {
  previousDecision: ReentryReconciledCommitDecision;
  lease: ReentryAuthorityLease;
  atomicCommit: WriteBackAtomicCommit;
  receiptBackend: ReentryDurableCommitReceiptBackend;
}): Promise<ReentryLateReceiptFinalizationDecision> {
  if (input.previousDecision.status !== "UNKNOWN_OUTCOME") {
    return {
      status: "HOLD",
      stage: "OUTCOME_FINALIZATION",
      reason: "PRIOR_DECISION_NOT_UNKNOWN",
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  if (input.previousDecision.authorityKey !== input.lease.authorityKey) {
    return {
      status: "HOLD",
      stage: "OUTCOME_FINALIZATION",
      reason: "PRIOR_UNKNOWN_BINDING_MISMATCH",
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  const recovered = await recoverReentryAtomicCommitOutcome({
    lease: input.lease,
    atomicCommit: input.atomicCommit,
    receiptBackend: input.receiptBackend,
  });

  if (recovered.status === "COMMITTED") {
    return {
      status: "COMMITTED",
      source: "LATE_DURABLE_RECEIPT",
      commitSequence: recovered.commitSequence,
      authorityKey: recovered.authorityKey,
      committedAt: recovered.committedAt,
    };
  }

  if (recovered.status === "UNKNOWN_OUTCOME") {
    return {
      ...recovered,
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  return {
    status: "HOLD",
    stage: "OUTCOME_FINALIZATION",
    reason: recovered.reason,
    retryDisposition: "DO_NOT_RETRY",
  };
}

/**
 * Safe public path: derive atomicCommit again from the verified trust pipeline.
 * The caller cannot supply recovery authority and cannot supply a commit backend.
 */
export async function finalizeReentryUnknownOutcomeFromVerifiedPipeline<T = unknown>(input: {
  previousDecision: ReentryReconciledCommitDecision;
  pipeline: EndToEndTrustPipelineInput<T>;
  lease: ReentryAuthorityLease;
  receiptBackend: ReentryDurableCommitReceiptBackend;
}): Promise<ReentryLateReceiptFinalizationDecision> {
  if (input.previousDecision.status !== "UNKNOWN_OUTCOME") {
    return {
      status: "HOLD",
      stage: "OUTCOME_FINALIZATION",
      reason: "PRIOR_DECISION_NOT_UNKNOWN",
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  if (input.previousDecision.authorityKey !== input.lease.authorityKey) {
    return {
      status: "HOLD",
      stage: "OUTCOME_FINALIZATION",
      reason: "PRIOR_UNKNOWN_BINDING_MISMATCH",
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  const preflight = evaluateEndToEndTrustPipeline(input.pipeline);
  if (preflight.status !== "READY_TO_COMMIT") {
    return {
      status: "HOLD",
      stage: "OUTCOME_FINALIZATION",
      reason: "VERIFIED_ATOMIC_COMMIT_UNAVAILABLE",
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  return finalizeObservedReentryUnknownOutcome({
    previousDecision: snapshot(input.previousDecision),
    lease: snapshot(input.lease),
    atomicCommit: snapshot(preflight.atomicCommit),
    receiptBackend: input.receiptBackend,
  });
}
