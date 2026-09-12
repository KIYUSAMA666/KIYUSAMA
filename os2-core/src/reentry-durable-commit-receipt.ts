import type { ReentryAuthorityLease } from "./reentry-authority-lease.js";
import type { WriteBackAtomicCommit } from "./write-back.js";

export const REENTRY_COMMIT_RECEIPT_VERSION = "OS2_REENTRY_COMMIT_RECEIPT_V01" as const;

export interface ReentryDurableCommitReceipt {
  receiptVersion: typeof REENTRY_COMMIT_RECEIPT_VERSION;
  authorityKey: string;
  leaseId: string;
  actionId: string;
  stateId: string;
  fromRevision: number;
  toRevision: number;
  priorCommitSequence: number;
  committedSequence: number;
  resultId: string;
  handoffId: string;
  nextCurrent: unknown;
  committedAt: string;
}

export interface ReentryDurableCommitReceiptBackend {
  readByAuthorityKey(authorityKey: string): Promise<
    | { status: "COMMITTED"; receipt: ReentryDurableCommitReceipt }
    | { status: "NOT_FOUND" }
    | { status: "BINDING_MISMATCH" }
  >;
}

export type ReentryCommitOutcomeRecoveryDecision =
  | {
      status: "COMMITTED";
      source: "DURABLE_RECEIPT";
      commitSequence: number;
      authorityKey: string;
      committedAt: string;
    }
  | {
      status: "UNKNOWN_OUTCOME";
      reason: "RECEIPT_NOT_FOUND" | "RECEIPT_BACKEND_FAILURE";
      authorityKey: string;
    }
  | {
      status: "HOLD";
      reason: "RECEIPT_BINDING_MISMATCH" | "RECEIPT_PROTOCOL_FAILURE";
      authorityKey: string;
    };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) out[key] = canonicalize(record[key]);
    return out;
  }
  return value;
}

function jsonbEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

function exactReceiptBinding(
  receipt: ReentryDurableCommitReceipt,
  lease: ReentryAuthorityLease,
  atomicCommit: WriteBackAtomicCommit,
): boolean {
  const next = atomicCommit.nextCurrent;
  return (
    receipt.receiptVersion === REENTRY_COMMIT_RECEIPT_VERSION &&
    receipt.authorityKey === lease.authorityKey &&
    receipt.leaseId === lease.leaseId &&
    receipt.actionId === lease.actionId &&
    receipt.stateId === lease.stateId &&
    receipt.fromRevision === lease.stateRevision &&
    receipt.toRevision === lease.stateRevision + 1 &&
    receipt.priorCommitSequence === lease.commitSequence &&
    receipt.committedSequence === lease.commitSequence + 1 &&
    receipt.resultId === atomicCommit.consumeResultId &&
    receipt.handoffId === atomicCommit.consumeHandoffId &&
    atomicCommit.expectedCurrent.expectedCurrentStateId === lease.stateId &&
    atomicCommit.expectedCurrent.expectedCurrentRevision === lease.stateRevision &&
    jsonbEqual(receipt.nextCurrent, next)
  );
}

/**
 * Reconcile an ambiguous post-RPC outcome without re-executing the commit.
 *
 * An exact durable receipt is sufficient proof that the combined transaction
 * committed. Absence is deliberately UNKNOWN rather than NOT_COMMITTED because
 * the original transport may have failed while the server was still executing.
 */
export async function recoverReentryAtomicCommitOutcome(input: {
  lease: ReentryAuthorityLease;
  atomicCommit: WriteBackAtomicCommit;
  receiptBackend: ReentryDurableCommitReceiptBackend;
}): Promise<ReentryCommitOutcomeRecoveryDecision> {
  const authorityKey = input.lease.authorityKey;
  let decision:
    | { status: "COMMITTED"; receipt: ReentryDurableCommitReceipt }
    | { status: "NOT_FOUND" }
    | { status: "BINDING_MISMATCH" };

  try {
    decision = await input.receiptBackend.readByAuthorityKey(authorityKey);
  } catch {
    return { status: "UNKNOWN_OUTCOME", reason: "RECEIPT_BACKEND_FAILURE", authorityKey };
  }

  if (decision.status === "NOT_FOUND") {
    return { status: "UNKNOWN_OUTCOME", reason: "RECEIPT_NOT_FOUND", authorityKey };
  }
  if (decision.status === "BINDING_MISMATCH") {
    return { status: "HOLD", reason: "RECEIPT_BINDING_MISMATCH", authorityKey };
  }

  const receipt = decision.receipt;
  if (
    !receipt ||
    typeof receipt.committedAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.committedAt)) ||
    !Number.isInteger(receipt.committedSequence) ||
    receipt.committedSequence < 1
  ) {
    return { status: "HOLD", reason: "RECEIPT_PROTOCOL_FAILURE", authorityKey };
  }

  if (!exactReceiptBinding(receipt, input.lease, input.atomicCommit)) {
    return { status: "HOLD", reason: "RECEIPT_BINDING_MISMATCH", authorityKey };
  }

  return {
    status: "COMMITTED",
    source: "DURABLE_RECEIPT",
    commitSequence: receipt.committedSequence,
    authorityKey,
    committedAt: receipt.committedAt,
  };
}
