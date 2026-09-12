import {
  REENTRY_COMMIT_RECEIPT_VERSION,
  type ReentryDurableCommitReceipt,
  type ReentryDurableCommitReceiptBackend,
} from "./reentry-durable-commit-receipt.js";

const RPC = "os2_reentry_read_atomic_commit_receipt";

export interface SupabaseJsReentryCommitReceiptClientLike {
  rpc(
    functionName: string,
    args: { p_authority_key: string },
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

function finiteInteger(value: unknown, min: number): value is number {
  return Number.isInteger(value) && (value as number) >= min;
}

function parseReceipt(raw: unknown):
  | { status: "COMMITTED"; receipt: ReentryDurableCommitReceipt }
  | { status: "NOT_FOUND" }
  | { status: "BINDING_MISMATCH" } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("malformed durable commit receipt response");
  }
  const r = raw as Record<string, unknown>;
  if (r.status === "NOT_FOUND") return { status: "NOT_FOUND" };
  if (r.status === "BINDING_MISMATCH") return { status: "BINDING_MISMATCH" };
  if (r.status !== "COMMITTED") throw new Error("unknown durable commit receipt status");

  if (
    r.receiptVersion !== REENTRY_COMMIT_RECEIPT_VERSION ||
    typeof r.authorityKey !== "string" || !r.authorityKey.trim() ||
    typeof r.leaseId !== "string" || !r.leaseId.trim() ||
    typeof r.actionId !== "string" || !r.actionId.trim() ||
    typeof r.stateId !== "string" || !r.stateId.trim() ||
    !finiteInteger(r.fromRevision, 1) ||
    !finiteInteger(r.toRevision, 2) ||
    !finiteInteger(r.priorCommitSequence, 0) ||
    !finiteInteger(r.committedSequence, 1) ||
    typeof r.resultId !== "string" || !r.resultId.trim() ||
    typeof r.handoffId !== "string" || !r.handoffId.trim() ||
    typeof r.committedAt !== "string" || !Number.isFinite(Date.parse(r.committedAt)) ||
    typeof r.nextCurrent !== "object" || r.nextCurrent === null || Array.isArray(r.nextCurrent)
  ) {
    throw new Error("invalid durable commit receipt");
  }

  return {
    status: "COMMITTED",
    receipt: {
      receiptVersion: REENTRY_COMMIT_RECEIPT_VERSION,
      authorityKey: r.authorityKey,
      leaseId: r.leaseId,
      actionId: r.actionId,
      stateId: r.stateId,
      fromRevision: r.fromRevision,
      toRevision: r.toRevision,
      priorCommitSequence: r.priorCommitSequence,
      committedSequence: r.committedSequence,
      resultId: r.resultId,
      handoffId: r.handoffId,
      nextCurrent: r.nextCurrent,
      committedAt: r.committedAt,
    },
  };
}

export function createSupabaseJsReentryDurableCommitReceiptBackend(
  client: SupabaseJsReentryCommitReceiptClientLike,
): ReentryDurableCommitReceiptBackend {
  return {
    async readByAuthorityKey(authorityKey: string) {
      const { data, error } = await client.rpc(RPC, { p_authority_key: authorityKey });
      if (error !== null) throw error;
      const parsed = parseReceipt(data);
      if (
        parsed.status === "COMMITTED" &&
        parsed.receipt.authorityKey !== authorityKey
      ) {
        throw new Error("durable receipt authority key mismatch");
      }
      return parsed;
    },
  };
}
