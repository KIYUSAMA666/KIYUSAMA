import {
  assertSnapshotInvariant,
  selectCurrentSnapshot,
  type CurrentStateSnapshot,
  type EvidenceVerdict,
  type LaneStatus,
  type RefStatus,
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

function isIsoTime(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function parseStringRecord(value: unknown): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([key, entry]) => !nonEmpty(key) || !nonEmpty(entry))) return null;
  return Object.fromEntries(entries) as Readonly<Record<string, string>>;
}

function parseActiveGuards(value: unknown): CurrentStateSnapshot["activeGuards"] | null {
  if (!Array.isArray(value)) return null;
  const guards: Array<{ guardId: string; rule: string; refConfirmed: RefStatus }> = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (!nonEmpty(entry.guardId) || !nonEmpty(entry.rule)) return null;
    if (entry.refConfirmed !== "VERIFIED" && entry.refConfirmed !== "UNVERIFIED_REF") return null;
    guards.push({
      guardId: entry.guardId,
      rule: entry.rule,
      refConfirmed: entry.refConfirmed,
    });
  }
  return guards;
}

function parseConfirmedRefIndex(value: unknown): CurrentStateSnapshot["confirmedRefIndex"] | null {
  if (!Array.isArray(value)) return null;
  const refs: Array<{
    id: string;
    status: RefStatus;
    expectedVersion: string | null;
    path: string | null;
  }> = [];
  for (const entry of value) {
    if (!isRecord(entry) || !nonEmpty(entry.id)) return null;
    if (entry.status !== "VERIFIED" && entry.status !== "UNVERIFIED_REF") return null;
    if (!(entry.expectedVersion === null || nonEmpty(entry.expectedVersion))) return null;
    if (!(entry.path === null || nonEmpty(entry.path))) return null;
    refs.push({
      id: entry.id,
      status: entry.status,
      expectedVersion: entry.expectedVersion,
      path: entry.path,
    });
  }
  return refs;
}

export function parseRuntimeCurrentStateSnapshot(value: unknown): CurrentStateSnapshot | null {
  if (!isRecord(value)) return null;
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
    !isIsoTime(identity.effectiveAt) ||
    identity.scope !== "KIYUSAMA_OS_2" ||
    !nonEmpty(identity.lineageId)
  ) return null;

  if (
    !isRecord(humanDecisionFinal) ||
    !nonEmpty(humanDecisionFinal.decisionId) ||
    humanDecisionFinal.sourceAuthority !== "KIYUSAMA" ||
    !nonEmpty(humanDecisionFinal.shortDirective)
  ) return null;

  if (
    !isRecord(mainLineTask) ||
    !nonEmpty(mainLineTask.taskId) ||
    !nonEmpty(mainLineTask.description) ||
    !isRecord(nextActionSingle) ||
    !nonEmpty(nextActionSingle.actionId) ||
    !nonEmpty(nextActionSingle.description)
  ) return null;

  const activeRolesAndAuthority = parseStringRecord(value.activeRolesAndAuthority);
  const activeGuards = parseActiveGuards(value.activeGuards);
  const confirmedRefIndex = parseConfirmedRefIndex(value.confirmedRefIndex);
  if (activeRolesAndAuthority === null || activeGuards === null || confirmedRefIndex === null) return null;

  if (!isRecord(independentLaneHealth)) return null;
  const laneStatus = independentLaneHealth.status;
  const evidenceVerdict = independentLaneHealth.evidenceVerdict;
  if (
    laneStatus !== "VERIFIED" &&
    laneStatus !== "UNVERIFIED" &&
    laneStatus !== "HOLD" &&
    laneStatus !== "FAIL"
  ) return null;
  if (
    evidenceVerdict !== "SUFFICIENT" &&
    evidenceVerdict !== "INSUFFICIENT" &&
    evidenceVerdict !== "CONFLICT"
  ) return null;
  if (!(independentLaneHealth.observedAt === null || isIsoTime(independentLaneHealth.observedAt))) return null;
  if (!nonEmpty(independentLaneHealth.evidenceSource)) return null;

  const snapshot: CurrentStateSnapshot = {
    identity: {
      stateId: identity.stateId,
      schemaVersion: identity.schemaVersion,
      stateRevision: identity.stateRevision as number,
      effectiveAt: identity.effectiveAt,
      scope: "KIYUSAMA_OS_2",
      lineageId: identity.lineageId,
    },
    humanDecisionFinal: {
      decisionId: humanDecisionFinal.decisionId,
      sourceAuthority: "KIYUSAMA",
      shortDirective: humanDecisionFinal.shortDirective,
    },
    mainLineTask: {
      taskId: mainLineTask.taskId,
      description: mainLineTask.description,
    },
    nextActionSingle: {
      actionId: nextActionSingle.actionId,
      description: nextActionSingle.description,
    },
    activeRolesAndAuthority,
    activeGuards,
    confirmedRefIndex,
    independentLaneHealth: {
      status: laneStatus as LaneStatus,
      evidenceVerdict: evidenceVerdict as EvidenceVerdict,
      observedAt: independentLaneHealth.observedAt,
      evidenceSource: independentLaneHealth.evidenceSource,
    },
  };

  try {
    assertSnapshotInvariant(snapshot);
  } catch {
    return null;
  }
  return snapshot;
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
    if (!nonEmpty(record.id)) {
      return {
        status: "HOLD",
        reason: "INVALID_CURRENT_PAYLOAD",
        resolutionVersion: COMMON_MEMORY_CURRENT_RESOLUTION_V01,
      };
    }
    const snapshot = parseRuntimeCurrentStateSnapshot(record.payload);
    if (snapshot === null) {
      return {
        status: "HOLD",
        reason: "INVALID_CURRENT_PAYLOAD",
        resolutionVersion: COMMON_MEMORY_CURRENT_RESOLUTION_V01,
      };
    }
    parsed.push({ id: record.id, snapshot });
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
