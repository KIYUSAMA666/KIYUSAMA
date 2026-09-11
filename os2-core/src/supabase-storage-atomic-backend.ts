import { assertSnapshotInvariant } from "./current-state.js";
import {
  toStorageAtomicCommitCommand,
  validateStorageAtomicCommitCommand,
  type AsyncStorageAtomicCommitBackend,
  type StorageAtomicCommitDecision,
  type StorageAtomicCommitCommand,
  type StorageAtomicHoldReason,
} from "./storage-atomic-commit-adapter.js";
import type { WriteBackAtomicCommit } from "./write-back.js";

export interface SupabaseAtomicRpcClient {
  compareConsumeAndSwap(command: StorageAtomicCommitCommand): Promise<unknown>;
}

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

  if (!exactJsonEqual(raw.current, command.nextCurrent)) {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  return {
    status: "COMMITTED",
    current: raw.current as never,
    commitSequence: raw.commitSequence as number,
  };
}

export class SupabaseStorageAtomicCommitBackend implements AsyncStorageAtomicCommitBackend {
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
  const command = toStorageAtomicCommitCommand(commit);
  const invalid = validateStorageAtomicCommitCommand(command);
  if (invalid !== null) return { status: "HOLD", reason: invalid };

  return new SupabaseStorageAtomicCommitBackend(client).compareConsumeAndSwap(command);
}
