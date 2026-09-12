import {
  evaluateEndToEndTrustPipeline,
  type EndToEndTrustPipelineInput,
} from "./end-to-end-trust-pipeline.js";
import {
  executeReentryAtomicExecutionCommit,
  type ReentryAtomicExecutionCommitBackend,
  type ReentryAtomicExecutionCommitDecision,
} from "./reentry-atomic-execution-commit.js";
import type {
  ReentryAuthorityExecutionRequest,
  ReentryAuthorityLease,
} from "./reentry-authority-lease.js";
import {
  recoverReentryAtomicCommitOutcome,
  type ReentryDurableCommitReceiptBackend,
} from "./reentry-durable-commit-receipt.js";
import type { WriteBackAtomicCommit } from "./write-back.js";

/**
 * RE-ENTRY AMBIGUOUS OUTCOME RECONCILIATION v0.1
 *
 * The atomic commit primitive deliberately fails closed when its backend throws.
 * But a thrown client/provider call is ambiguous: PostgreSQL may have committed
 * before the response was lost. This layer records whether the backend returned
 * a definite decision or threw, and consults the durable receipt ONLY for the
 * truly ambiguous case. It never retries the commit.
 */

export type ReentryAtomicBackendObservation =
  | { kind: "NOT_INVOKED" }
  | { kind: "RETURNED"; status: "COMMITTED" | "ALREADY_CONSUMED" | "BINDING_MISMATCH" | "COMMIT_REJECTED" }
  | { kind: "THREW" };

export type ReentryReconciledCommitDecision =
  | {
      status: "COMMITTED";
      source: "PRIMARY_RPC" | "DURABLE_RECEIPT";
      commitSequence: number;
      authorityKey: string;
      committedAt?: string;
    }
  | {
      status: "UNKNOWN_OUTCOME";
      reason: "RECEIPT_NOT_FOUND" | "RECEIPT_BACKEND_FAILURE";
      authorityKey: string;
      retryDisposition: "DO_NOT_RETRY";
    }
  | {
      status: "HOLD";
      stage: "TRUST_PIPELINE" | "AUTHORITY" | "ATOMIC_COMMIT" | "OUTCOME_RECONCILIATION";
      reason: string;
      pipelineStage?: string;
      retryDisposition?: "DO_NOT_RETRY";
    };

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function reconcileObservedReentryAtomicCommitOutcome(input: {
  primaryDecision: ReentryAtomicExecutionCommitDecision;
  backendObservation: ReentryAtomicBackendObservation;
  lease: ReentryAuthorityLease;
  atomicCommit: WriteBackAtomicCommit | null;
  receiptBackend: ReentryDurableCommitReceiptBackend;
}): Promise<ReentryReconciledCommitDecision> {
  const primary = input.primaryDecision;

  if (primary.status === "COMMITTED") {
    return {
      status: "COMMITTED",
      source: "PRIMARY_RPC",
      commitSequence: primary.commitSequence,
      authorityKey: primary.authorityKey,
    };
  }

  // A definite backend return (including COMMIT_REJECTED/BACKEND_FAILURE) is
  // not an acknowledgement-loss ambiguity. Preserve the original HOLD exactly.
  if (
    primary.stage !== "ATOMIC_COMMIT" ||
    primary.reason !== "BACKEND_FAILURE" ||
    input.backendObservation.kind !== "THREW" ||
    input.atomicCommit === null
  ) {
    return primary;
  }

  const recovered = await recoverReentryAtomicCommitOutcome({
    lease: input.lease,
    atomicCommit: input.atomicCommit,
    receiptBackend: input.receiptBackend,
  });

  if (recovered.status === "COMMITTED") {
    return {
      status: "COMMITTED",
      source: "DURABLE_RECEIPT",
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
    stage: "OUTCOME_RECONCILIATION",
    reason: recovered.reason,
    retryDisposition: "DO_NOT_RETRY",
  };
}

export async function executeReentryAtomicCommitWithOutcomeReconciliation<T = unknown>(input: {
  pipeline: EndToEndTrustPipelineInput<T>;
  lease: ReentryAuthorityLease;
  request: ReentryAuthorityExecutionRequest;
  now: string;
  backend: ReentryAtomicExecutionCommitBackend;
  receiptBackend: ReentryDurableCommitReceiptBackend;
}): Promise<ReentryReconciledCommitDecision> {
  // Derive the recovery binding from the same verified pipeline contract before
  // any caller-controlled backend is observed. Never accept a caller-supplied
  // atomic commit as recovery authority.
  const preflight = evaluateEndToEndTrustPipeline(input.pipeline);
  const atomicCommit =
    preflight.status === "READY_TO_COMMIT"
      ? snapshot(preflight.atomicCommit)
      : null;

  let observation: ReentryAtomicBackendObservation = { kind: "NOT_INVOKED" };
  const observedBackend: ReentryAtomicExecutionCommitBackend = {
    async claimAuthorityAndCommit(command) {
      try {
        const result = await input.backend.claimAuthorityAndCommit(command);
        observation = { kind: "RETURNED", status: result.status };
        return result;
      } catch (error) {
        observation = { kind: "THREW" };
        throw error;
      }
    },
  };

  const primaryDecision = await executeReentryAtomicExecutionCommit({
    pipeline: input.pipeline,
    lease: input.lease,
    request: input.request,
    now: input.now,
    backend: observedBackend,
  });

  return reconcileObservedReentryAtomicCommitOutcome({
    primaryDecision,
    backendObservation: observation,
    lease: snapshot(input.lease),
    atomicCommit,
    receiptBackend: input.receiptBackend,
  });
}
