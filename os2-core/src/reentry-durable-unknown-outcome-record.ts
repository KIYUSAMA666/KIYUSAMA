import {
  evaluateEndToEndTrustPipeline,
  type EndToEndTrustPipelineInput,
} from "./end-to-end-trust-pipeline.js";
import type { ReentryAuthorityLease } from "./reentry-authority-lease.js";
import type { ReentryReconciledCommitDecision } from "./reentry-ambiguous-outcome-reconciliation.js";
import {
  finalizeObservedReentryUnknownOutcome,
  type ReentryLateReceiptFinalizationDecision,
} from "./reentry-late-receipt-finalization.js";
import type { ReentryDurableCommitReceiptBackend } from "./reentry-durable-commit-receipt.js";
import type { WriteBackAtomicCommit } from "./write-back.js";

/**
 * RE-ENTRY DURABLE UNKNOWN OUTCOME RECORD v0.1
 *
 * UNKNOWN_OUTCOME is a safety state, not a transient in-memory error. If the
 * process restarts after an ambiguous atomic RPC, the system must recover the
 * fact that this authority is unresolved and must never infer permission to
 * execute the commit again. This layer durably records the exact unresolved
 * binding and later resumes receipt-only finalization from that record.
 *
 * No commit backend exists anywhere in this API.
 */
export const REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION =
  "OS2_REENTRY_UNKNOWN_OUTCOME_RECORD_V01" as const;

export interface ReentryDurableUnknownOutcomeRecord {
  recordVersion: typeof REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION;
  authorityKey: string;
  leaseId: string;
  actionId: string;
  stateId: string;
  stateRevision: number;
  commitSequence: number;
  resultId: string;
  handoffId: string;
  reason: "RECEIPT_NOT_FOUND" | "RECEIPT_BACKEND_FAILURE";
  observedAt: string;
}

export interface ReentryDurableUnknownOutcomeRecordBackend {
  writeIfAbsent(record: ReentryDurableUnknownOutcomeRecord): Promise<
    | { status: "STORED" }
    | { status: "ALREADY_EXISTS"; record: ReentryDurableUnknownOutcomeRecord }
    | { status: "BINDING_MISMATCH" }
  >;
  readByAuthorityKey(authorityKey: string): Promise<
    | { status: "FOUND"; record: ReentryDurableUnknownOutcomeRecord }
    | { status: "NOT_FOUND" }
    | { status: "BINDING_MISMATCH" }
  >;
}

export type ReentryUnknownOutcomeRecordDecision =
  | {
      status: "RECORDED";
      authorityKey: string;
      recordVersion: typeof REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION;
    }
  | {
      status: "HOLD";
      stage: "UNKNOWN_OUTCOME_RECORD";
      reason:
        | "PRIOR_DECISION_NOT_UNKNOWN"
        | "PRIOR_UNKNOWN_BINDING_MISMATCH"
        | "VERIFIED_ATOMIC_COMMIT_UNAVAILABLE"
        | "INVALID_OBSERVED_AT"
        | "RECORD_BACKEND_FAILURE"
        | "RECORD_BINDING_MISMATCH"
        | "RECORD_PROTOCOL_FAILURE";
      retryDisposition: "DO_NOT_RETRY";
    };

export type ReentryUnknownOutcomeResumeDecision =
  | ReentryLateReceiptFinalizationDecision
  | {
      status: "HOLD";
      stage: "UNKNOWN_OUTCOME_RESUME";
      reason:
        | "VERIFIED_ATOMIC_COMMIT_UNAVAILABLE"
        | "UNKNOWN_RECORD_NOT_FOUND"
        | "UNKNOWN_RECORD_BACKEND_FAILURE"
        | "UNKNOWN_RECORD_BINDING_MISMATCH"
        | "UNKNOWN_RECORD_PROTOCOL_FAILURE";
      retryDisposition: "DO_NOT_RETRY";
    };

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function protocolValid(record: ReentryDurableUnknownOutcomeRecord): boolean {
  return (
    record.recordVersion === REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION &&
    typeof record.authorityKey === "string" &&
    record.authorityKey.length > 0 &&
    typeof record.leaseId === "string" &&
    typeof record.actionId === "string" &&
    typeof record.stateId === "string" &&
    Number.isInteger(record.stateRevision) &&
    Number.isInteger(record.commitSequence) &&
    typeof record.resultId === "string" &&
    typeof record.handoffId === "string" &&
    (record.reason === "RECEIPT_NOT_FOUND" ||
      record.reason === "RECEIPT_BACKEND_FAILURE") &&
    typeof record.observedAt === "string" &&
    Number.isFinite(Date.parse(record.observedAt))
  );
}

function exactBinding(
  record: ReentryDurableUnknownOutcomeRecord,
  lease: ReentryAuthorityLease,
  atomicCommit: WriteBackAtomicCommit,
): boolean {
  return (
    record.authorityKey === lease.authorityKey &&
    record.leaseId === lease.leaseId &&
    record.actionId === lease.actionId &&
    record.stateId === lease.stateId &&
    record.stateRevision === lease.stateRevision &&
    record.commitSequence === lease.commitSequence &&
    record.resultId === atomicCommit.consumeResultId &&
    record.handoffId === atomicCommit.consumeHandoffId &&
    atomicCommit.expectedCurrent.expectedCurrentStateId === lease.stateId &&
    atomicCommit.expectedCurrent.expectedCurrentRevision === lease.stateRevision
  );
}

function sameRecord(
  a: ReentryDurableUnknownOutcomeRecord,
  b: ReentryDurableUnknownOutcomeRecord,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function recordObservedReentryUnknownOutcome(input: {
  previousDecision: ReentryReconciledCommitDecision;
  lease: ReentryAuthorityLease;
  atomicCommit: WriteBackAtomicCommit;
  observedAt: string;
  recordBackend: ReentryDurableUnknownOutcomeRecordBackend;
}): Promise<ReentryUnknownOutcomeRecordDecision> {
  if (input.previousDecision.status !== "UNKNOWN_OUTCOME") {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RECORD",
      reason: "PRIOR_DECISION_NOT_UNKNOWN",
      retryDisposition: "DO_NOT_RETRY",
    };
  }
  if (input.previousDecision.authorityKey !== input.lease.authorityKey) {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RECORD",
      reason: "PRIOR_UNKNOWN_BINDING_MISMATCH",
      retryDisposition: "DO_NOT_RETRY",
    };
  }
  if (!Number.isFinite(Date.parse(input.observedAt))) {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RECORD",
      reason: "INVALID_OBSERVED_AT",
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  const record: ReentryDurableUnknownOutcomeRecord = {
    recordVersion: REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION,
    authorityKey: input.lease.authorityKey,
    leaseId: input.lease.leaseId,
    actionId: input.lease.actionId,
    stateId: input.lease.stateId,
    stateRevision: input.lease.stateRevision,
    commitSequence: input.lease.commitSequence,
    resultId: input.atomicCommit.consumeResultId,
    handoffId: input.atomicCommit.consumeHandoffId,
    reason: input.previousDecision.reason,
    observedAt: input.observedAt,
  };

  if (!exactBinding(record, input.lease, input.atomicCommit)) {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RECORD",
      reason: "RECORD_BINDING_MISMATCH",
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  let written:
    | { status: "STORED" }
    | { status: "ALREADY_EXISTS"; record: ReentryDurableUnknownOutcomeRecord }
    | { status: "BINDING_MISMATCH" };
  try {
    written = await input.recordBackend.writeIfAbsent(snapshot(record));
  } catch {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RECORD",
      reason: "RECORD_BACKEND_FAILURE",
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  if (written.status === "BINDING_MISMATCH") {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RECORD",
      reason: "RECORD_BINDING_MISMATCH",
      retryDisposition: "DO_NOT_RETRY",
    };
  }
  if (written.status === "ALREADY_EXISTS") {
    if (!protocolValid(written.record)) {
      return {
        status: "HOLD",
        stage: "UNKNOWN_OUTCOME_RECORD",
        reason: "RECORD_PROTOCOL_FAILURE",
        retryDisposition: "DO_NOT_RETRY",
      };
    }
    if (!sameRecord(written.record, record)) {
      return {
        status: "HOLD",
        stage: "UNKNOWN_OUTCOME_RECORD",
        reason: "RECORD_BINDING_MISMATCH",
        retryDisposition: "DO_NOT_RETRY",
      };
    }
  }

  return {
    status: "RECORDED",
    authorityKey: record.authorityKey,
    recordVersion: REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION,
  };
}

export async function recordReentryUnknownOutcomeFromVerifiedPipeline<T = unknown>(input: {
  previousDecision: ReentryReconciledCommitDecision;
  pipeline: EndToEndTrustPipelineInput<T>;
  lease: ReentryAuthorityLease;
  observedAt: string;
  recordBackend: ReentryDurableUnknownOutcomeRecordBackend;
}): Promise<ReentryUnknownOutcomeRecordDecision> {
  const preflight = evaluateEndToEndTrustPipeline(input.pipeline);
  if (preflight.status !== "READY_TO_COMMIT") {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RECORD",
      reason: "VERIFIED_ATOMIC_COMMIT_UNAVAILABLE",
      retryDisposition: "DO_NOT_RETRY",
    };
  }
  return recordObservedReentryUnknownOutcome({
    previousDecision: snapshot(input.previousDecision),
    lease: snapshot(input.lease),
    atomicCommit: snapshot(preflight.atomicCommit),
    observedAt: input.observedAt,
    recordBackend: input.recordBackend,
  });
}

export async function resumeObservedReentryUnknownOutcomeFromDurableRecord(input: {
  lease: ReentryAuthorityLease;
  atomicCommit: WriteBackAtomicCommit;
  recordBackend: ReentryDurableUnknownOutcomeRecordBackend;
  receiptBackend: ReentryDurableCommitReceiptBackend;
}): Promise<ReentryUnknownOutcomeResumeDecision> {
  let loaded:
    | { status: "FOUND"; record: ReentryDurableUnknownOutcomeRecord }
    | { status: "NOT_FOUND" }
    | { status: "BINDING_MISMATCH" };
  try {
    loaded = await input.recordBackend.readByAuthorityKey(input.lease.authorityKey);
  } catch {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RESUME",
      reason: "UNKNOWN_RECORD_BACKEND_FAILURE",
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  if (loaded.status === "NOT_FOUND") {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RESUME",
      reason: "UNKNOWN_RECORD_NOT_FOUND",
      retryDisposition: "DO_NOT_RETRY",
    };
  }
  if (loaded.status === "BINDING_MISMATCH") {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RESUME",
      reason: "UNKNOWN_RECORD_BINDING_MISMATCH",
      retryDisposition: "DO_NOT_RETRY",
    };
  }
  if (!protocolValid(loaded.record)) {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RESUME",
      reason: "UNKNOWN_RECORD_PROTOCOL_FAILURE",
      retryDisposition: "DO_NOT_RETRY",
    };
  }
  if (!exactBinding(loaded.record, input.lease, input.atomicCommit)) {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RESUME",
      reason: "UNKNOWN_RECORD_BINDING_MISMATCH",
      retryDisposition: "DO_NOT_RETRY",
    };
  }

  const previousDecision: ReentryReconciledCommitDecision = {
    status: "UNKNOWN_OUTCOME",
    reason: loaded.record.reason,
    authorityKey: loaded.record.authorityKey,
    retryDisposition: "DO_NOT_RETRY",
  };

  return finalizeObservedReentryUnknownOutcome({
    previousDecision,
    lease: snapshot(input.lease),
    atomicCommit: snapshot(input.atomicCommit),
    receiptBackend: input.receiptBackend,
  });
}

export async function resumeReentryUnknownOutcomeFromDurableRecord<T = unknown>(input: {
  pipeline: EndToEndTrustPipelineInput<T>;
  lease: ReentryAuthorityLease;
  recordBackend: ReentryDurableUnknownOutcomeRecordBackend;
  receiptBackend: ReentryDurableCommitReceiptBackend;
}): Promise<ReentryUnknownOutcomeResumeDecision> {
  const preflight = evaluateEndToEndTrustPipeline(input.pipeline);
  if (preflight.status !== "READY_TO_COMMIT") {
    return {
      status: "HOLD",
      stage: "UNKNOWN_OUTCOME_RESUME",
      reason: "VERIFIED_ATOMIC_COMMIT_UNAVAILABLE",
      retryDisposition: "DO_NOT_RETRY",
    };
  }
  return resumeObservedReentryUnknownOutcomeFromDurableRecord({
    lease: snapshot(input.lease),
    atomicCommit: snapshot(preflight.atomicCommit),
    recordBackend: input.recordBackend,
    receiptBackend: input.receiptBackend,
  });
}
