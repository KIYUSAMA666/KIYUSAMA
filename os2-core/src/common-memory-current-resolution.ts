import {
  assertSnapshotInvariant,
  selectCurrentSnapshot,
  type CurrentStateSnapshot,
} from "./current-state.js";
import {
  selectExecutionCandidates,
  type MemoryRecord,
} from "./memory-selection.js";

export const COMMON_MEMORY_CURRENT_RESOLUTION_V01 =
  "COMMON_MEMORY_CURRENT_RESOLUTION_V01" as const;

export type CommonMemoryCurrentResolutionReason =
  | "NO_CURRENT_MEMORY"
  | "INVALID_CURRENT_PAYLOAD"
  | "STATE_ID_CONFLICT"
  | "SCHEMA_VERSION_CONFLICT"
  | "STATE_CONFLICT"
  | "LINEAGE_CONFLICT";

export type CommonMemoryCurrentResolutionDecision =
  | {
      status: "RESOLVED";
      snapshot: CurrentStateSnapshot;
      sourceMemoryId: string;
      resolutionVersion: typeof COMMON_MEMORY_CURRENT_RESOLUTION_V01;
    }
  | {
      status: "HOLD";
      reason: CommonMemoryCurrentResolutionReason;
      resolutionVersion: typeof COMMON_MEMORY_CURRENT_RESOLUTION_V01;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRuntimeCurrentStateSnapshot(value: unknown): value is CurrentStateSnapshot {
  if (!isRecord(value)) return false;
  const identity = value.identity;
  const humanDecisionFinal = value.humanDecisionFinal;
  const mainLineTask = value.mainLineTask;
  const nextActionSingle = value.nextActionSingle;
  const independentLaneHealth = value.independentLaneHealth;

  if (
    !isRecord(identity) ||
    !nonEmpty(identity.stateId) ||
    !nonEmpty(identity.schemaVersion) ||
    !Number.isInteger(identity.stateRevision) ||
    (identity.stateRevision as number) < 1 ||
    !nonEmpty(identity.effectiveAt) ||
    !Number.isFinite(Date.parse(identity.effectiveAt as string)) ||
    identity.scope !== "KIYUSAMA_OS_2" ||
    !nonEmpty(identity.lineageId)
  ) return false;

  if (
    !isRecord(humanDecisionFinal) ||
    !nonEmpty(humanDecisionFinal.decisionId) ||
    humanDecisionFinal.sourceAuthority !== "KIYUSAMA" ||
    !nonEmpty(humanDecisionFinal.shortDirective)
  ) return false;

  if (
    !isRecord(mainLineTask) ||
    !nonEmpty(mainLineTask.taskId) ||
    !nonEmpty(mainLineTask.description) ||
    !isRecord(nextActionSingle) ||
    !nonEmpty(nextActionSingle.actionId) ||
    !nonEmpty(nextActionSingle.description)
  ) return false;

  if (!isRecord(value.activeRolesAndAuthority)) return false;
  if (!Array.isArray(value.activeGuards) || !Array.isArray(value.confirmedRefIndex)) return false;

  if (
    !isRecord(independentLaneHealth) ||
    !["VERIFIED", "UNVERIFIED", "HOLD", "FAIL"].includes(
      independentLaneHealth.status as string,
    ) ||
    !["SUFFICIENT", "INSUFFICIENT", "CONFLICT"].includes(
      independentLaneHealth.evidenceVerdict as string,
    ) ||
    !(independentLaneHealth.observedAt === null ||
      (nonEmpty(independentLaneHealth.observedAt) &&
        Number.isFinite(Date.parse(independentLaneHealth.observedAt)))) ||
    !nonEmpty(independentLaneHealth.evidenceSource)
  ) return false;

  try {
    assertSnapshotInvariant(value as CurrentStateSnapshot);
  } catch {
    return false;
  }
  return true;
}

/**
 * Resolve COMMON MEMORY retrieval into exactly one executable CURRENT snapshot.
 * Search/ranking order has no authority: all CURRENT records are inspected.
 * Non-CURRENT records are ignored for execution selection.
 * Any malformed CURRENT, state identity split, schema split, lineage split,
 * or same-revision payload conflict fails closed.
 */
export function resolveCommonMemoryCurrent(
  records: ReadonlyArray<MemoryRecord<unknown>>,
): CommonMemoryCurrentResolutionDecision {
  const currentRecords = selectExecutionCandidates(records);
  if (currentRecords.length === 0) {
    return {
      status: "HOLD",
      reason: "NO_CURRENT_MEMORY",
      resolutionVersion: COMMON_MEMORY_CURRENT_RESOLUTION_V01,
    };
  }

  const parsed: Array<{ id: string; snapshot: CurrentStateSnapshot }> = [];
  for (const record of currentRecords) {
    if (!nonEmpty(record.id) || !isRuntimeCurrentStateSnapshot(record.payload)) {
      return {
        status: "HOLD",
        reason: "INVALID_CURRENT_PAYLOAD",
        resolutionVersion: COMMON_MEMORY_CURRENT_RESOLUTION_V01,
      };
    }
    parsed.push({ id: record.id, snapshot: record.payload });
  }

  const stateId = parsed[0]!.snapshot.identity.stateId;
  if (parsed.some((entry) => entry.snapshot.identity.stateId !== stateId)) {
    return {
      status: "HOLD",
      reason: "STATE_ID_CONFLICT",
      resolutionVersion: COMMON_MEMORY_CURRENT_RESOLUTION_V01,
    };
  }

  const schemaVersion = parsed[0]!.snapshot.identity.schemaVersion;
  if (parsed.some((entry) => entry.snapshot.identity.schemaVersion !== schemaVersion)) {
    return {
      status: "HOLD",
      reason: "SCHEMA_VERSION_CONFLICT",
      resolutionVersion: COMMON_MEMORY_CURRENT_RESOLUTION_V01,
    };
  }

  let selected = parsed[0]!;
  for (const entry of parsed.slice(1)) {
    const decision = selectCurrentSnapshot(selected.snapshot, entry.snapshot);
    if (decision.status === "LINEAGE_CONFLICT") {
      return {
        status: "HOLD",
        reason: "LINEAGE_CONFLICT",
        resolutionVersion: COMMON_MEMORY_CURRENT_RESOLUTION_V01,
      };
    }
    if (decision.status === "STATE_CONFLICT") {
      return {
        status: "HOLD",
        reason: "STATE_CONFLICT",
        resolutionVersion: COMMON_MEMORY_CURRENT_RESOLUTION_V01,
      };
    }
    selected = decision.snapshot === selected.snapshot ? selected : entry;
  }

  return {
    status: "RESOLVED",
    snapshot: selected.snapshot,
    sourceMemoryId: selected.id,
    resolutionVersion: COMMON_MEMORY_CURRENT_RESOLUTION_V01,
  };
}
