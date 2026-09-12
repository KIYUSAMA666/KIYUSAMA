import type { ReentryAuthorityLease } from "./reentry-authority-lease.js";
import {
  REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION,
  type ReentryDurableUnknownOutcomeRecord,
} from "./reentry-durable-unknown-outcome-record.js";

/**
 * RE-ENTRY UNKNOWN OUTCOME RECORD CONSUME v0.1
 *
 * A durable UNKNOWN record must not remain an active unresolved marker forever
 * after a later durable receipt has conclusively finalized the same authority.
 * This layer closes that lifecycle without creating any commit/retry path.
 */
export const REENTRY_UNKNOWN_OUTCOME_RECORD_CONSUME_VERSION =
  "OS2_REENTRY_UNKNOWN_OUTCOME_RECORD_CONSUME_V01" as const;

export interface ReentryUnknownOutcomeRecordConsumeBackend {
  consumeIfExact(input: {
    authorityKey: string;
    recordVersion: typeof REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION;
    leaseId: string;
    actionId: string;
    stateId: string;
    stateRevision: number;
    commitSequence: number;
    resultId: string;
    handoffId: string;
    observedAt: string;
    finalizedAt: string;
  }): Promise<
    | { status: "CONSUMED" }
    | { status: "ALREADY_CONSUMED"; finalizedAt: string }
    | { status: "NOT_FOUND" }
    | { status: "BINDING_MISMATCH" }
  >;
}

export type ReentryUnknownOutcomeRecordConsumeDecision =
  | {
      status: "CONSUMED";
      authorityKey: string;
      consumeVersion: typeof REENTRY_UNKNOWN_OUTCOME_RECORD_CONSUME_VERSION;
    }
  | {
      status: "HOLD";
      stage: "UNKNOWN_OUTCOME_RECORD_CONSUME";
      reason:
        | "FINAL_DECISION_NOT_COMMITTED"
        | "FINAL_DECISION_SOURCE_NOT_LATE_RECEIPT"
        | "FINAL_DECISION_BINDING_MISMATCH"
        | "UNKNOWN_RECORD_PROTOCOL_FAILURE"
        | "UNKNOWN_RECORD_BINDING_MISMATCH"
        | "INVALID_FINALIZED_AT"
        | "RECORD_NOT_FOUND"
        | "RECORD_BACKEND_FAILURE"
        | "RECORD_BINDING_MISMATCH"
        | "RECORD_PROTOCOL_FAILURE";
      retryDisposition: "DO_NOT_RETRY";
    };

export interface LateReceiptCommittedDecision {
  status: "COMMITTED";
  source: "LATE_DURABLE_RECEIPT";
  authorityKey: string;
  commitSequence: number;
  committedAt: string;
}

function protocolValid(record: ReentryDurableUnknownOutcomeRecord): boolean {
  return (
    record.recordVersion === REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION &&
    typeof record.authorityKey === "string" && record.authorityKey.length > 0 &&
    typeof record.leaseId === "string" && record.leaseId.length > 0 &&
    typeof record.actionId === "string" && record.actionId.length > 0 &&
    typeof record.stateId === "string" && record.stateId.length > 0 &&
    Number.isInteger(record.stateRevision) &&
    Number.isInteger(record.commitSequence) &&
    typeof record.resultId === "string" && record.resultId.length > 0 &&
    typeof record.handoffId === "string" && record.handoffId.length > 0 &&
    (record.reason === "RECEIPT_NOT_FOUND" || record.reason === "RECEIPT_BACKEND_FAILURE") &&
    typeof record.observedAt === "string" && Number.isFinite(Date.parse(record.observedAt))
  );
}

function exactBinding(record: ReentryDurableUnknownOutcomeRecord, lease: ReentryAuthorityLease): boolean {
  return (
    record.authorityKey === lease.authorityKey &&
    record.leaseId === lease.leaseId &&
    record.actionId === lease.actionId &&
    record.stateId === lease.stateId &&
    record.stateRevision === lease.stateRevision &&
    record.commitSequence === lease.commitSequence
  );
}

export async function consumeFinalizedReentryUnknownOutcomeRecord(input: {
  finalDecision: LateReceiptCommittedDecision | { status: string; source?: string; authorityKey?: string; commitSequence?: number; committedAt?: string };
  lease: ReentryAuthorityLease;
  record: ReentryDurableUnknownOutcomeRecord;
  backend: ReentryUnknownOutcomeRecordConsumeBackend;
}): Promise<ReentryUnknownOutcomeRecordConsumeDecision> {
  if (input.finalDecision.status !== "COMMITTED") {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "FINAL_DECISION_NOT_COMMITTED", retryDisposition: "DO_NOT_RETRY" };
  }
  if (input.finalDecision.source !== "LATE_DURABLE_RECEIPT") {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "FINAL_DECISION_SOURCE_NOT_LATE_RECEIPT", retryDisposition: "DO_NOT_RETRY" };
  }
  if (
    input.finalDecision.authorityKey !== input.lease.authorityKey ||
    input.finalDecision.commitSequence !== input.lease.commitSequence ||
    !Number.isFinite(Date.parse(input.finalDecision.committedAt ?? ""))
  ) {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "FINAL_DECISION_BINDING_MISMATCH", retryDisposition: "DO_NOT_RETRY" };
  }
  if (!protocolValid(input.record)) {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "UNKNOWN_RECORD_PROTOCOL_FAILURE", retryDisposition: "DO_NOT_RETRY" };
  }
  if (!exactBinding(input.record, input.lease)) {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "UNKNOWN_RECORD_BINDING_MISMATCH", retryDisposition: "DO_NOT_RETRY" };
  }

  const finalizedAt = input.finalDecision.committedAt!;
  if (!Number.isFinite(Date.parse(finalizedAt))) {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "INVALID_FINALIZED_AT", retryDisposition: "DO_NOT_RETRY" };
  }

  let result: Awaited<ReturnType<ReentryUnknownOutcomeRecordConsumeBackend["consumeIfExact"]>>;
  try {
    result = await input.backend.consumeIfExact({
      authorityKey: input.record.authorityKey,
      recordVersion: input.record.recordVersion,
      leaseId: input.record.leaseId,
      actionId: input.record.actionId,
      stateId: input.record.stateId,
      stateRevision: input.record.stateRevision,
      commitSequence: input.record.commitSequence,
      resultId: input.record.resultId,
      handoffId: input.record.handoffId,
      observedAt: input.record.observedAt,
      finalizedAt,
    });
  } catch {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "RECORD_BACKEND_FAILURE", retryDisposition: "DO_NOT_RETRY" };
  }

  if (result.status === "NOT_FOUND") {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "RECORD_NOT_FOUND", retryDisposition: "DO_NOT_RETRY" };
  }
  if (result.status === "BINDING_MISMATCH") {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "RECORD_BINDING_MISMATCH", retryDisposition: "DO_NOT_RETRY" };
  }
  if (result.status === "ALREADY_CONSUMED" && result.finalizedAt !== finalizedAt) {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "RECORD_PROTOCOL_FAILURE", retryDisposition: "DO_NOT_RETRY" };
  }

  return {
    status: "CONSUMED",
    authorityKey: input.record.authorityKey,
    consumeVersion: REENTRY_UNKNOWN_OUTCOME_RECORD_CONSUME_VERSION,
  };
}
