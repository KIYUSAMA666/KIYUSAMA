import type { ReentryAuthorityLease } from "./reentry-authority-lease.js";
import {
  REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_VERSION,
  type ReentryUnknownOutcomeResolutionReceipt,
} from "./reentry-unknown-outcome-resolution-receipt.js";

/**
 * RE-ENTRY RESOLUTION RECEIPT RECOVERY v0.1
 *
 * A durable resolution receipt is useful only if a fresh process can recover
 * it without reconstructing permission to commit or requiring the consumed
 * UNKNOWN record to still exist. This read-only boundary proves that an exact
 * authority was already resolved and returns the durable proof.
 *
 * No commit, retry, consume, close, or write backend exists in this API.
 */
export const REENTRY_RESOLUTION_RECEIPT_RECOVERY_VERSION =
  "OS2_REENTRY_RESOLUTION_RECEIPT_RECOVERY_V01" as const;

export interface ReentryResolutionReceiptRecoveryBackend {
  readResolutionByAuthorityKey(authorityKey: string): Promise<
    | { status: "FOUND"; receipt: ReentryUnknownOutcomeResolutionReceipt }
    | { status: "NOT_FOUND" }
    | { status: "BINDING_MISMATCH" }
  >;
}

export type ReentryResolutionReceiptRecoveryDecision =
  | {
      status: "RESOLVED";
      source: "DURABLE_RESOLUTION_RECEIPT";
      authorityKey: string;
      commitSequence: number;
      resultId: string;
      handoffId: string;
      finalizedAt: string;
      receipt: ReentryUnknownOutcomeResolutionReceipt;
      recoveryVersion: typeof REENTRY_RESOLUTION_RECEIPT_RECOVERY_VERSION;
    }
  | {
      status: "UNRESOLVED";
      reason: "RESOLUTION_RECEIPT_NOT_FOUND";
      retryDisposition: "DO_NOT_COMMIT";
    }
  | {
      status: "HOLD";
      stage: "RESOLUTION_RECEIPT_RECOVERY";
      reason:
        | "RECEIPT_BACKEND_FAILURE"
        | "RECEIPT_BACKEND_BINDING_MISMATCH"
        | "RECEIPT_PROTOCOL_FAILURE"
        | "RECEIPT_BINDING_MISMATCH";
      retryDisposition: "DO_NOT_COMMIT";
    };

function validTime(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function receiptProtocolValid(receipt: ReentryUnknownOutcomeResolutionReceipt): boolean {
  return (
    receipt.receiptVersion === REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_VERSION &&
    typeof receipt.authorityKey === "string" && receipt.authorityKey.length > 0 &&
    typeof receipt.leaseId === "string" && receipt.leaseId.length > 0 &&
    typeof receipt.actionId === "string" && receipt.actionId.length > 0 &&
    typeof receipt.stateId === "string" && receipt.stateId.length > 0 &&
    Number.isInteger(receipt.stateRevision) && receipt.stateRevision >= 0 &&
    Number.isInteger(receipt.commitSequence) && receipt.commitSequence >= 0 &&
    typeof receipt.resultId === "string" && receipt.resultId.length > 0 &&
    typeof receipt.handoffId === "string" && receipt.handoffId.length > 0 &&
    validTime(receipt.unknownObservedAt) &&
    validTime(receipt.finalizedAt) &&
    Date.parse(receipt.finalizedAt) >= Date.parse(receipt.unknownObservedAt)
  );
}

function receiptMatchesLease(
  receipt: ReentryUnknownOutcomeResolutionReceipt,
  lease: ReentryAuthorityLease,
): boolean {
  return (
    receipt.authorityKey === lease.authorityKey &&
    receipt.leaseId === lease.leaseId &&
    receipt.actionId === lease.actionId &&
    receipt.stateId === lease.stateId &&
    receipt.stateRevision === lease.stateRevision &&
    receipt.commitSequence === lease.commitSequence
  );
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function recoverReentryResolutionFromDurableReceipt(input: {
  lease: ReentryAuthorityLease;
  backend: ReentryResolutionReceiptRecoveryBackend;
}): Promise<ReentryResolutionReceiptRecoveryDecision> {
  let outcome: Awaited<ReturnType<ReentryResolutionReceiptRecoveryBackend["readResolutionByAuthorityKey"]>>;
  try {
    outcome = await input.backend.readResolutionByAuthorityKey(input.lease.authorityKey);
  } catch {
    return {
      status: "HOLD",
      stage: "RESOLUTION_RECEIPT_RECOVERY",
      reason: "RECEIPT_BACKEND_FAILURE",
      retryDisposition: "DO_NOT_COMMIT",
    };
  }

  if (outcome.status === "NOT_FOUND") {
    return {
      status: "UNRESOLVED",
      reason: "RESOLUTION_RECEIPT_NOT_FOUND",
      retryDisposition: "DO_NOT_COMMIT",
    };
  }
  if (outcome.status === "BINDING_MISMATCH") {
    return {
      status: "HOLD",
      stage: "RESOLUTION_RECEIPT_RECOVERY",
      reason: "RECEIPT_BACKEND_BINDING_MISMATCH",
      retryDisposition: "DO_NOT_COMMIT",
    };
  }
  if (!receiptProtocolValid(outcome.receipt)) {
    return {
      status: "HOLD",
      stage: "RESOLUTION_RECEIPT_RECOVERY",
      reason: "RECEIPT_PROTOCOL_FAILURE",
      retryDisposition: "DO_NOT_COMMIT",
    };
  }
  if (!receiptMatchesLease(outcome.receipt, input.lease)) {
    return {
      status: "HOLD",
      stage: "RESOLUTION_RECEIPT_RECOVERY",
      reason: "RECEIPT_BINDING_MISMATCH",
      retryDisposition: "DO_NOT_COMMIT",
    };
  }

  const receipt = snapshot(outcome.receipt);
  return {
    status: "RESOLVED",
    source: "DURABLE_RESOLUTION_RECEIPT",
    authorityKey: receipt.authorityKey,
    commitSequence: receipt.commitSequence,
    resultId: receipt.resultId,
    handoffId: receipt.handoffId,
    finalizedAt: receipt.finalizedAt,
    receipt,
    recoveryVersion: REENTRY_RESOLUTION_RECEIPT_RECOVERY_VERSION,
  };
}
