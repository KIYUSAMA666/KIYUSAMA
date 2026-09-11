import { assertSnapshotInvariant } from "./current-state.js";
import {
  applyStorageAtomicCommitAsync,
  type AsyncStorageAtomicCommitBackend,
} from "./production-async-commit-bridge.js";
import {
  type StorageAtomicCommitDecision,
  type StorageAtomicCommitCommand,
  type StorageAtomicHoldReason,
} from "./storage-atomic-commit-adapter.js";
import type { WriteBackAtomicCommit } from "./write-back.js";

export interface SupabaseAtomicRpcClient {
  compareConsumeAndSwap(command: StorageAtomicCommitCommand): Promise<unknown>;
}

/** Minimal structural contract for the current supabase-js rpc() API. */
export interface SupabaseJsClientLike {
  rpc(
    functionName: string,
    args: { p_command: StorageAtomicCommitCommand },
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

const SUPABASE_ATOMIC_RPC = "os2_storage_compare_consume_and_swap";

const HOLD_REASONS = new Set<StorageAtomicHoldReason>([
  "INVALID_ATOMIC_COMMIT",
  "REVISION_CONFLICT",
  "RESULT_ALREADY_CONSUMED",
  "HANDOFF_ALREADY_CONSUMED",
  "BACKEND_FAILURE",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createSupabaseJsAtomicRpcClient(
  client: SupabaseJsClientLike,
): SupabaseAtomicRpcClient {
  return {
    async compareConsumeAndSwap(command: StorageAtomicCommitCommand): Promise<unknown> {
      const { data, error } = await client.rpc(SUPABASE_ATOMIC_RPC, {
        p_command: command,
      });
      if (error !== null) throw error;
      return data;
    },
  };
}

export function parseSupabaseAtomicDecision(
  raw: unknown,
  command: StorageAtomicCommitCommand,
): StorageAtomicCommitDecision {
  if (!isRecord(raw) || typeof raw.status !== "string") {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  if (raw.status === "HOLD") {
    if (typeof raw.reason !== "string" || !HOLD_REASONS.has(raw.reason as StorageAtomicHoldReason)) {
      return { status: "HOLD", reason: "BACKEND_FAILURE" };
    }
    return { status: "HOLD", reason: raw.reason as StorageAtomicHoldReason };
  }

  if (raw.status !== "COMMITTED") {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  if (!Number.isInteger(raw.commitSequence) || (raw.commitSequence as number) < 1 || !isRecord(raw.current)) {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  try {
    assertSnapshotInvariant(raw.current as never);
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  // The provider is not allowed to acknowledge COMMITTED for a payload other than
  // the exact nextCurrent that passed WRITE BACK and the provider-neutral adapter.
  if (!exactJsonEqual(raw.current, command.nextCurrent)) {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  return {
    status: "COMMITTED",
    current: raw.current as never,
    commitSequence: raw.commitSequence as number,
  };
}

export class SupabaseAsyncAtomicCommitBackend implements AsyncStorageAtomicCommitBackend {
  constructor(private readonly client: SupabaseAtomicRpcClient) {}

  async compareConsumeAndSwap(
    command: StorageAtomicCommitCommand,
  ): Promise<StorageAtomicCommitDecision> {
    try {
      const raw = await this.client.compareConsumeAndSwap(command);
      return parseSupabaseAtomicDecision(raw, command);
    } catch {
      return { status: "HOLD", reason: "BACKEND_FAILURE" };
    }
  }
}

export async function applyStorageAtomicCommitWithSupabase(
  client: SupabaseAtomicRpcClient,
  commit: WriteBackAtomicCommit,
): Promise<StorageAtomicCommitDecision> {
  return applyStorageAtomicCommitAsync(
    new SupabaseAsyncAtomicCommitBackend(client),
    commit,
  );
}
