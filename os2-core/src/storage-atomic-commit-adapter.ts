import { assertSnapshotInvariant, type CurrentStateSnapshot } from "./current-state.js";
import type { WriteBackAtomicCommit, WriteBackCurrentStateCandidate } from "./write-back.js";

/**
 * STORAGE ATOMIC COMMIT ADAPTER v0.1
 *
 * Purpose:
 * bridge the already-validated WRITE BACK atomic projection to persistence without
 * splitting CAS, result consumption, handoff consumption, and CURRENT replacement
 * into separate storage operations.
 *
 * Contract:
 * - the adapter performs validation, then invokes exactly one backend atomic primitive;
 * - the backend primitive must evaluate CAS + both consumption guards and persist all
 *   three effects as one indivisible transaction;
 * - a HOLD or thrown backend error must not be reported as COMMITTED.
 */

export type StorageAtomicHoldReason =
  | "INVALID_ATOMIC_COMMIT"
  | "REVISION_CONFLICT"
  | "RESULT_ALREADY_CONSUMED"
  | "HANDOFF_ALREADY_CONSUMED"
  | "BACKEND_FAILURE";

export type StorageAtomicCommitDecision =
  | {
      status: "COMMITTED";
      current: CurrentStateSnapshot;
      commitSequence: number;
    }
  | {
      status: "HOLD";
      reason: StorageAtomicHoldReason;
    };

export interface StorageAtomicCommitCommand {
  expectedCurrentStateId: string;
  expectedCurrentRevision: number;
  consumeResultId: string;
  consumeHandoffId: string;
  nextCurrent: WriteBackCurrentStateCandidate;
}

export interface StorageAtomicCommitBackend {
  /**
   * REQUIRED ATOMIC PRIMITIVE.
   * Implementations must perform the compare, both consumption checks/inserts,
   * and CURRENT replacement in one transaction/conditional write boundary.
   */
  compareConsumeAndSwap(command: StorageAtomicCommitCommand): StorageAtomicCommitDecision;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function toStorageAtomicCommitCommand(commit: WriteBackAtomicCommit): StorageAtomicCommitCommand {
  return {
    expectedCurrentStateId: commit.expectedCurrent.expectedCurrentStateId,
    expectedCurrentRevision: commit.expectedCurrent.expectedCurrentRevision,
    consumeResultId: commit.consumeResultId,
    consumeHandoffId: commit.consumeHandoffId,
    nextCurrent: commit.nextCurrent,
  };
}

export function validateStorageAtomicCommitCommand(
  command: StorageAtomicCommitCommand,
): StorageAtomicHoldReason | null {
  if (
    !command.expectedCurrentStateId.trim() ||
    !Number.isInteger(command.expectedCurrentRevision) ||
    command.expectedCurrentRevision < 1 ||
    !command.consumeResultId.trim() ||
    !command.consumeHandoffId.trim()
  ) {
    return "INVALID_ATOMIC_COMMIT";
  }

  try {
    assertSnapshotInvariant(command.nextCurrent);
  } catch {
    return "INVALID_ATOMIC_COMMIT";
  }

  const candidate = command.nextCurrent;
  if (
    candidate.identity.stateId !== command.expectedCurrentStateId ||
    candidate.identity.stateRevision !== command.expectedCurrentRevision + 1 ||
    candidate.writeBack.parent.parentStateId !== command.expectedCurrentStateId ||
    candidate.writeBack.parent.parentRevision !== command.expectedCurrentRevision ||
    candidate.writeBack.source.sourceResultId !== command.consumeResultId ||
    candidate.writeBack.source.sourceHandoffId !== command.consumeHandoffId
  ) {
    return "INVALID_ATOMIC_COMMIT";
  }

  return null;
}

export function applyStorageAtomicCommit(
  backend: StorageAtomicCommitBackend,
  commit: WriteBackAtomicCommit,
): StorageAtomicCommitDecision {
  const command = toStorageAtomicCommitCommand(commit);
  const invalid = validateStorageAtomicCommitCommand(command);
  if (invalid !== null) return { status: "HOLD", reason: invalid };

  try {
    const decision = backend.compareConsumeAndSwap(command);
    if (decision.status === "COMMITTED") {
      return {
        status: "COMMITTED",
        current: clone(decision.current),
        commitSequence: decision.commitSequence,
      };
    }
    return decision;
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }
}

export interface InMemoryAtomicStoreSeed {
  current: CurrentStateSnapshot;
  consumedResultIds?: ReadonlyArray<string>;
  consumedHandoffIds?: ReadonlyArray<string>;
  commitSequence?: number;
}

export interface InMemoryAtomicStoreSnapshot {
  current: CurrentStateSnapshot;
  consumedResultIds: ReadonlyArray<string>;
  consumedHandoffIds: ReadonlyArray<string>;
  commitSequence: number;
}

/**
 * Executable reference backend for the v0.1 atomic semantics.
 * JavaScript execution is synchronous inside compareConsumeAndSwap, so no caller can
 * observe or interleave a partial mutation. Production adapters must map the same
 * primitive to a real transactional/conditional storage operation.
 */
export class InMemoryAtomicCommitBackend implements StorageAtomicCommitBackend {
  private current: CurrentStateSnapshot;
  private readonly consumedResultIds: Set<string>;
  private readonly consumedHandoffIds: Set<string>;
  private commitSequence: number;
  private failBeforeCommit = false;

  constructor(seed: InMemoryAtomicStoreSeed) {
    this.current = clone(seed.current);
    this.consumedResultIds = new Set(seed.consumedResultIds ?? []);
    this.consumedHandoffIds = new Set(seed.consumedHandoffIds ?? []);
    this.commitSequence = seed.commitSequence ?? 0;
  }

  setFailBeforeCommitForTest(enabled: boolean): void {
    this.failBeforeCommit = enabled;
  }

  snapshot(): InMemoryAtomicStoreSnapshot {
    return {
      current: clone(this.current),
      consumedResultIds: [...this.consumedResultIds].sort(),
      consumedHandoffIds: [...this.consumedHandoffIds].sort(),
      commitSequence: this.commitSequence,
    };
  }

  compareConsumeAndSwap(command: StorageAtomicCommitCommand): StorageAtomicCommitDecision {
    if (
      this.current.identity.stateId !== command.expectedCurrentStateId ||
      this.current.identity.stateRevision !== command.expectedCurrentRevision
    ) {
      return { status: "HOLD", reason: "REVISION_CONFLICT" };
    }

    if (this.consumedResultIds.has(command.consumeResultId)) {
      return { status: "HOLD", reason: "RESULT_ALREADY_CONSUMED" };
    }

    if (this.consumedHandoffIds.has(command.consumeHandoffId)) {
      return { status: "HOLD", reason: "HANDOFF_ALREADY_CONSUMED" };
    }

    if (this.failBeforeCommit) {
      throw new Error("simulated backend failure before atomic commit");
    }

    // Commit point: all checks are complete. Mutations below form one synchronous unit
    // in this executable reference backend.
    this.consumedResultIds.add(command.consumeResultId);
    this.consumedHandoffIds.add(command.consumeHandoffId);
    this.current = clone(command.nextCurrent);
    this.commitSequence += 1;

    return {
      status: "COMMITTED",
      current: clone(this.current),
      commitSequence: this.commitSequence,
    };
  }
}
