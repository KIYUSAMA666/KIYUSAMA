import type { ReentryAuthorityLease } from "./reentry-authority-lease.js";
import {
  REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION,
  type ReentryDurableUnknownOutcomeRecord,
} from "./reentry-durable-unknown-outcome-record.js";
import type { LateReceiptCommittedDecision } from "./reentry-unknown-outcome-record-consume.js";

/**
 * RE-ENTRY UNKNOWN OUTCOME RESOLUTION RECEIPT v0.1
 *
 * Closing an UNKNOWN record is not enough if the fact of closure can disappear
 * after a crash. This boundary requires the backend to atomically close the
 * exact durable UNKNOWN record and write a durable resolution receipt for the
 * same authority in one operation.
 *
 * No commit/retry backend exists anywhere in this API.
 */
export const REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_VERSION =
  "OS2_REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_V01" as const;

export interface ReentryUnknownOutcomeResolutionReceipt {
  receiptVersion: typeof REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_VERSION;
  authorityKey: string;
  leaseId: string;
  actionId: string;
  stateId: string;
  stateRevision: number;
  commitSequence: number;
  resultId: string;
  handoffId: string;
  unknownObservedAt: string;
  finalizedAt: string;
}

export interface ReentryUnknownOutcomeResolutionReceiptBackend {
  closeAndWriteResolutionIfExact(input: {
    record: ReentryDurableUnknownOutcomeRecord;
    receipt: ReentryUnknownOutcomeResolutionReceipt;
  }): Promise<
    | { status: "RESOLVED"; receipt: ReentryUnknownOutcomeResolutionReceipt }
    | { status: "ALREADY_RESOLVED"; receipt: ReentryUnknownOutcomeResolutionReceipt }
    | { status: "NOT_FOUND" }
    | { status: "BINDING_MISMATCH" }
  >;
}

export type ReentryUnknownOutcomeResolutionDecision =
  | {
      status: "RESOLVED";
      authorityKey: string;
      receipt: ReentryUnknownOutcomeResolutionReceipt;
    }
  | {
      status: "HOLD";
      stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT";
      reason:
        | "FINAL_DECISION_NOT_COMMITTED"
        | "FINAL_DECISION_SOURCE_NOT_LATE_RECEIPT"
        | "FINAL_DECISION_BINDING_MISMATCH"
        | "UNKNOWN_RECORD_PROTOCOL_FAILURE"
        | "UNKNOWN_RECORD_BINDING_MISMATCH"
        | "BACKEND_FAILURE"
        | "UNKNOWN_RECORD_NOT_FOUND"
        | "BACKEND_BINDING_MISMATCH"
        | "RECEIPT_PROTOCOL_FAILURE"
        | "RECEIPT_BINDING_MISMATCH";
      retryDisposition: "DO_NOT_RETRY";
    };

function validTime(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function unknownRecordProtocolValid(record: ReentryDurableUnknownOutcomeRecord): boolean {
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
    validTime(record.observedAt)
  );
}

function unknownRecordMatchesLease(record: ReentryDurableUnknownOutcomeRecord, lease: ReentryAuthorityLease): boolean {
  return (
    record.authorityKey === lease.authorityKey &&
    record.leaseId === lease.leaseId &&
    record.actionId === lease.actionId &&
    record.stateId === lease.stateId &&
    record.stateRevision === lease.stateRevision &&
    record.commitSequence === lease.commitSequence
  );
}

function receiptProtocolValid(receipt: ReentryUnknownOutcomeResolutionReceipt): boolean {
  return (
    receipt.receiptVersion === REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_VERSION &&
    typeof receipt.authorityKey === "string" && receipt.authorityKey.length > 0 &&
    typeof receipt.leaseId === "string" && receipt.leaseId.length > 0 &&
    typeof receipt.actionId === "string" && receipt.actionId.length > 0 &&
    typeof receipt.stateId === "string" && receipt.stateId.length > 0 &&
    Number.isInteger(receipt.stateRevision) &&
    Number.isInteger(receipt.commitSequence) &&
    typeof receipt.resultId === "string" && receipt.resultId.length > 0 &&
    typeof receipt.handoffId === "string" && receipt.handoffId.length > 0 &&
    validTime(receipt.unknownObservedAt) &&
    validTime(receipt.finalizedAt)
  );
}

function expectedReceipt(input: {
  record: ReentryDurableUnknownOutcomeRecord;
  finalizedAt: string;
}): ReentryUnknownOutcomeResolutionReceipt {
  return {
    receiptVersion: REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_VERSION,
    authorityKey: input.record.authorityKey,
    leaseId: input.record.leaseId,
    actionId: input.record.actionId,
    stateId: input.record.stateId,
    stateRevision: input.record.stateRevision,
    commitSequence: input.record.commitSequence,
    resultId: input.record.resultId,
    handoffId: input.record.handoffId,
    unknownObservedAt: input.record.observedAt,
    finalizedAt: input.finalizedAt,
  };
}

function sameReceipt(a: ReentryUnknownOutcomeResolutionReceipt, b: ReentryUnknownOutcomeResolutionReceipt): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function resolveReentryUnknownOutcomeWithDurableReceipt(input: {
  finalDecision: LateReceiptCommittedDecision | {
    status: string;
    source?: string;
    authorityKey?: string;
    commitSequence?: number;
    committedAt?: string;
  };
  lease: ReentryAuthorityLease;
  record: ReentryDurableUnknownOutcomeRecord;
  backend: ReentryUnknownOutcomeResolutionReceiptBackend;
}): Promise<ReentryUnknownOutcomeResolutionDecision> {
  if (input.finalDecision.status !== "COMMITTED") {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT", reason: "FINAL_DECISION_NOT_COMMITTED", retryDisposition: "DO_NOT_RETRY" };
  }
  if (input.finalDecision.source !== "LATE_DURABLE_RECEIPT") {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT", reason: "FINAL_DECISION_SOURCE_NOT_LATE_RECEIPT", retryDisposition: "DO_NOT_RETRY" };
  }
  if (
    input.finalDecision.authorityKey !== input.lease.authorityKey ||
    input.finalDecision.commitSequence !== input.lease.commitSequence ||
    !validTime(input.finalDecision.committedAt ?? "")
  ) {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT", reason: "FINAL_DECISION_BINDING_MISMATCH", retryDisposition: "DO_NOT_RETRY" };
  }
  if (!unknownRecordProtocolValid(input.record)) {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT", reason: "UNKNOWN_RECORD_PROTOCOL_FAILURE", retryDisposition: "DO_NOT_RETRY" };
  }
  if (!unknownRecordMatchesLease(input.record, input.lease)) {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT", reason: "UNKNOWN_RECORD_BINDING_MISMATCH", retryDisposition: "DO_NOT_RETRY" };
  }

  const expected = expectedReceipt({
    record: input.record,
    finalizedAt: input.finalDecision.committedAt!,
  });

  let outcome: Awaited<ReturnType<ReentryUnknownOutcomeResolutionReceiptBackend["closeAndWriteResolutionIfExact"]>>;
  try {
    outcome = await input.backend.closeAndWriteResolutionIfExact({
      record: JSON.parse(JSON.stringify(input.record)) as ReentryDurableUnknownOutcomeRecord,
      receipt: JSON.parse(JSON.stringify(expected)) as ReentryUnknownOutcomeResolutionReceipt,
    });
  } catch {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT", reason: "BACKEND_FAILURE", retryDisposition: "DO_NOT_RETRY" };
  }

  if (outcome.status === "NOT_FOUND") {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT", reason: "UNKNOWN_RECORD_NOT_FOUND", retryDisposition: "DO_NOT_RETRY" };
  }
  if (outcome.status === "BINDING_MISMATCH") {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT", reason: "BACKEND_BINDING_MISMATCH", retryDisposition: "DO_NOT_RETRY" };
  }
  if (!receiptProtocolValid(outcome.receipt)) {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT", reason: "RECEIPT_PROTOCOL_FAILURE", retryDisposition: "DO_NOT_RETRY" };
  }
  if (!sameReceipt(outcome.receipt, expected)) {
    return { status: "HOLD", stage: "UNKNOWN_OUTCOME_RESOLUTION_RECEIPT", reason: "RECEIPT_BINDING_MISMATCH", retryDisposition: "DO_NOT_RETRY" };
  }

  return {
    status: "RESOLVED",
    authorityKey: expected.authorityKey,
    receipt: outcome.receipt,
  };
}
