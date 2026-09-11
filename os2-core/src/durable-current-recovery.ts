import { assertSnapshotInvariant, type CurrentStateSnapshot } from "./current-state.js";

export interface DurableCurrentRecord {
  stateId: string;
  revision: number;
  current: unknown;
  commitSequence: number;
}

export interface DurableCurrentExpectation {
  stateId: string;
  lineageId: string;
  minCommitSequence?: number;
}

export type DurableCurrentRecoveryDecision =
  | { status: "RECOVERED"; current: CurrentStateSnapshot; commitSequence: number }
  | {
      status: "HOLD";
      reason:
        | "MISSING_CURRENT"
        | "MALFORMED_CURRENT"
        | "STATE_ID_MISMATCH"
        | "REVISION_MISMATCH"
        | "LINEAGE_MISMATCH"
        | "COMMIT_SEQUENCE_TOO_OLD";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneSnapshot(snapshot: CurrentStateSnapshot): CurrentStateSnapshot {
  return structuredClone(snapshot);
}

export function recoverDurableCurrent(
  raw: unknown,
  expected: DurableCurrentExpectation,
): DurableCurrentRecoveryDecision {
  if (raw === null || raw === undefined) {
    return { status: "HOLD", reason: "MISSING_CURRENT" };
  }
  if (!isRecord(raw)) {
    return { status: "HOLD", reason: "MALFORMED_CURRENT" };
  }

  const { stateId, revision, current, commitSequence } = raw;
  if (
    typeof stateId !== "string" || !stateId.trim() ||
    !Number.isInteger(revision) || (revision as number) < 1 ||
    !isRecord(current) ||
    !Number.isInteger(commitSequence) || (commitSequence as number) < 0
  ) {
    return { status: "HOLD", reason: "MALFORMED_CURRENT" };
  }

  let snapshot: CurrentStateSnapshot;
  try {
    assertSnapshotInvariant(current as CurrentStateSnapshot);
    snapshot = current as CurrentStateSnapshot;
  } catch {
    return { status: "HOLD", reason: "MALFORMED_CURRENT" };
  }

  if (stateId !== expected.stateId || snapshot.identity.stateId !== expected.stateId) {
    return { status: "HOLD", reason: "STATE_ID_MISMATCH" };
  }
  if (snapshot.identity.stateRevision !== revision) {
    return { status: "HOLD", reason: "REVISION_MISMATCH" };
  }
  if (snapshot.identity.lineageId !== expected.lineageId) {
    return { status: "HOLD", reason: "LINEAGE_MISMATCH" };
  }

  const minCommitSequence = expected.minCommitSequence ?? 0;
  if (!Number.isInteger(minCommitSequence) || minCommitSequence < 0) {
    return { status: "HOLD", reason: "MALFORMED_CURRENT" };
  }
  if ((commitSequence as number) < minCommitSequence) {
    return { status: "HOLD", reason: "COMMIT_SEQUENCE_TOO_OLD" };
  }

  return {
    status: "RECOVERED",
    current: cloneSnapshot(snapshot),
    commitSequence: commitSequence as number,
  };
}
