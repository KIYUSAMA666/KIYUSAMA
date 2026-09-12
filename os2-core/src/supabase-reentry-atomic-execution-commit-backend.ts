import type { ReentryAtomicExecutionCommitBackend } from "./reentry-atomic-execution-commit.js";

const RPC = "os2_reentry_atomic_execution_commit";

export interface SupabaseJsReentryAtomicCommitClientLike {
  rpc(
    functionName: string,
    args: { p_input: unknown },
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

type BackendDecision = Awaited<
  ReturnType<ReentryAtomicExecutionCommitBackend["claimAuthorityAndCommit"]>
>;

function parseDecision(raw: unknown): BackendDecision {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("malformed re-entry atomic execution response");
  }
  const record = raw as Record<string, unknown>;
  if (record.status === "COMMITTED") {
    if (!Number.isInteger(record.commitSequence) || (record.commitSequence as number) < 0) {
      throw new Error("invalid committed sequence");
    }
    if (typeof record.authorityKey !== "string" || !record.authorityKey.trim()) {
      throw new Error("invalid committed authority key");
    }
    return {
      status: "COMMITTED",
      commitSequence: record.commitSequence as number,
    };
  }
  if (record.status === "ALREADY_CONSUMED") return { status: "ALREADY_CONSUMED" };
  if (record.status === "BINDING_MISMATCH") return { status: "BINDING_MISMATCH" };
  if (record.status === "COMMIT_REJECTED") {
    if (typeof record.reason !== "string" || !record.reason.trim()) {
      throw new Error("invalid commit rejection reason");
    }
    return { status: "COMMIT_REJECTED", reason: record.reason };
  }
  throw new Error("unknown re-entry atomic execution status");
}

/**
 * Production adapter for RE-ENTRY ATOMIC EXECUTION COMMIT v0.1.
 * One RPC invocation crosses the application/database boundary. The caller's
 * claimedAt is intentionally not forwarded; PostgreSQL clock_timestamp() is the
 * authoritative claim time inside the transaction.
 */
export function createSupabaseJsReentryAtomicExecutionCommitBackend(
  client: SupabaseJsReentryAtomicCommitClientLike,
): ReentryAtomicExecutionCommitBackend {
  return {
    async claimAuthorityAndCommit(input) {
      const { data, error } = await client.rpc(RPC, {
        p_input: {
          lease: input.lease,
          request: input.request,
          atomicCommit: input.atomicCommit,
        },
      });
      if (error !== null) throw error;
      const parsed = parseDecision(data);
      if (
        typeof data === "object" &&
        data !== null &&
        !Array.isArray(data) &&
        (data as Record<string, unknown>).status === "COMMITTED" &&
        (data as Record<string, unknown>).authorityKey !== input.lease.authorityKey
      ) {
        throw new Error("committed authority key mismatch");
      }
      return parsed;
    },
  };
}
