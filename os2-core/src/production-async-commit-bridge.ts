import { assertSnapshotInvariant } from "./current-state.js";
import {
  toStorageAtomicCommitCommand,
  validateStorageAtomicCommitCommand,
  type StorageAtomicCommitBackend,
  type StorageAtomicCommitCommand,
  type StorageAtomicCommitDecision,
  type StorageAtomicHoldReason,
} from "./storage-atomic-commit-adapter.js";
import type { WriteBackAtomicCommit } from "./write-back.js";

/**
 * PRODUCTION ASYNC COMMIT BRIDGE v0.1
 *
 * Preserves the synchronous StorageAtomicCommitBackend contract while allowing
 * production backends to cross an asynchronous network boundary (for example,
 * Supabase/PostgREST RPC). The bridge validates before dispatch, awaits exactly
 * one backend primitive, and validates the returned decision before exposing it
 * to the trusted commit orchestrator.
 */

export interface AsyncStorageAtomicCommitBackend {
  compareConsumeAndSwap(
    command: StorageAtomicCommitCommand,
  ): Promise<StorageAtomicCommitDecision>;
}

export type CompatibleAtomicCommitBackend =
  | StorageAtomicCommitBackend
  | AsyncStorageAtomicCommitBackend;

const HOLD_REASONS = new Set<StorageAtomicHoldReason>([
  "INVALID_ATOMIC_COMMIT",
  "REVISION_CONFLICT",
  "RESULT_ALREADY_CONSUMED",
  "HANDOFF_ALREADY_CONSUMED",
  "BACKEND_FAILURE",
]);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function exactJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeDecision(
  decision: StorageAtomicCommitDecision,
  command: StorageAtomicCommitCommand,
): StorageAtomicCommitDecision {
  if (!decision || typeof decision !== "object") {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  if (decision.status === "HOLD") {
    if (!HOLD_REASONS.has(decision.reason)) {
      return { status: "HOLD", reason: "BACKEND_FAILURE" };
    }
    return { status: "HOLD", reason: decision.reason };
  }

  if (
    decision.status !== "COMMITTED" ||
    !Number.isInteger(decision.commitSequence) ||
    decision.commitSequence < 1
  ) {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  try {
    assertSnapshotInvariant(decision.current);
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  // A remote backend may not acknowledge a different payload than the one that
  // passed validation. This closes response substitution across the async seam.
  if (!exactJsonEqual(decision.current, command.nextCurrent)) {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  return {
    status: "COMMITTED",
    current: clone(decision.current),
    commitSequence: decision.commitSequence,
  };
}

export async function applyStorageAtomicCommitAsync(
  backend: CompatibleAtomicCommitBackend,
  commit: WriteBackAtomicCommit,
): Promise<StorageAtomicCommitDecision> {
  const command = toStorageAtomicCommitCommand(commit);
  const invalid = validateStorageAtomicCommitCommand(command);
  if (invalid !== null) return { status: "HOLD", reason: invalid };

  try {
    const decision = await backend.compareConsumeAndSwap(command);
    return normalizeDecision(decision, command);
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }
}
