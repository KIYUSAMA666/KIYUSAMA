export const INCREMENTAL_OBSERVATION_V01 =
  "INCREMENTAL_OBSERVATION_V01" as const;

export interface DurableObservationMetadata {
  id: number;
  createdAt: string;
  createdBy: string;
  subjectKey: string;
  status: string;
  conflictFlag: boolean;
}

export type IncrementalObservationDecision =
  | {
      status: "NEW_METADATA";
      records: ReadonlyArray<DurableObservationMetadata>;
      highWaterId: number;
      version: typeof INCREMENTAL_OBSERVATION_V01;
    }
  | {
      status: "NO_NEW_METADATA";
      highWaterId: number;
      version: typeof INCREMENTAL_OBSERVATION_V01;
    }
  | {
      status: "HOLD";
      reason: "INVALID_HIGH_WATER" | "INVALID_METADATA";
      version: typeof INCREMENTAL_OBSERVATION_V01;
    };

/**
 * Pure fail-closed selector for low-cost OPEN ROOM observation.
 *
 * It deliberately operates on metadata only. Content/body loading is a later
 * step after a new id has been detected and selected for verification.
 * This prevents an observation failure from being misreported as "no record".
 */
export function selectIncrementalObservationMetadata(
  records: ReadonlyArray<DurableObservationMetadata>,
  afterId: number,
): IncrementalObservationDecision {
  if (!Number.isInteger(afterId) || afterId < 0) {
    return {
      status: "HOLD",
      reason: "INVALID_HIGH_WATER",
      version: INCREMENTAL_OBSERVATION_V01,
    };
  }

  const invalid = records.some(
    (r) =>
      !Number.isInteger(r.id) ||
      r.id < 1 ||
      typeof r.createdAt !== "string" ||
      !Number.isFinite(Date.parse(r.createdAt)) ||
      typeof r.createdBy !== "string" ||
      !r.createdBy.trim() ||
      typeof r.subjectKey !== "string" ||
      !r.subjectKey.trim() ||
      typeof r.status !== "string" ||
      !r.status.trim() ||
      typeof r.conflictFlag !== "boolean",
  );
  if (invalid) {
    return {
      status: "HOLD",
      reason: "INVALID_METADATA",
      version: INCREMENTAL_OBSERVATION_V01,
    };
  }

  const newer = records
    .filter((r) => r.id > afterId)
    .sort((a, b) => a.id - b.id);

  if (newer.length === 0) {
    return {
      status: "NO_NEW_METADATA",
      highWaterId: afterId,
      version: INCREMENTAL_OBSERVATION_V01,
    };
  }

  return {
    status: "NEW_METADATA",
    records: newer,
    highWaterId: newer[newer.length - 1]!.id,
    version: INCREMENTAL_OBSERVATION_V01,
  };
}
