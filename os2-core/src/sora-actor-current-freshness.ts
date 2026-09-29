export const SORA_ACTOR_CURRENT_FRESHNESS_V01 =
  "SORA_ACTOR_CURRENT_FRESHNESS_V01" as const;

export interface SoraActorCanonicalRecord {
  id: number;
  createdBy: string;
  createdAt: string;
  status: string;
  conflictFlag: boolean;
  subjectKey?: string | null;
  title?: string | null;
}

export type SoraActorFreshnessDecision =
  | {
      status: "RESOLVED";
      record: SoraActorCanonicalRecord;
      ageMs: number;
      resolutionVersion: typeof SORA_ACTOR_CURRENT_FRESHNESS_V01;
    }
  | {
      status: "HOLD";
      reason: "NO_CANONICAL" | "STALE_CANONICAL" | "INVALID_RECORD";
      resolutionVersion: typeof SORA_ACTOR_CURRENT_FRESHNESS_V01;
    };

function actorId(room: number): string {
  if (!Number.isInteger(room) || room < 1 || room > 99) {
    throw new Error("invalid SORA room");
  }
  return `SORA_${String(room).padStart(2, "0")}`;
}

function validTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

/**
 * Select a room's durable canonical CURRENT without using chat/conversation
 * history as an authority surface. Fail closed on stale/missing data.
 *
 * Input records must come from the existing Production COMMON MEMORY read
 * surface. This function does not mutate Production and grants no authority.
 */
export function resolveFreshSoraActorCanonical(
  records: ReadonlyArray<SoraActorCanonicalRecord>,
  room: number,
  nowMs: number,
  maxAgeMs: number,
): SoraActorFreshnessDecision {
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    return {
      status: "HOLD",
      reason: "INVALID_RECORD",
      resolutionVersion: SORA_ACTOR_CURRENT_FRESHNESS_V01,
    };
  }

  const expectedActor = actorId(room);
  const candidates = records.filter(
    (record) =>
      record.createdBy === expectedActor &&
      record.status === "ACTIVE" &&
      record.conflictFlag === false,
  );

  if (candidates.length === 0) {
    return {
      status: "HOLD",
      reason: "NO_CANONICAL",
      resolutionVersion: SORA_ACTOR_CURRENT_FRESHNESS_V01,
    };
  }

  if (
    candidates.some(
      (record) =>
        !Number.isInteger(record.id) ||
        record.id < 1 ||
        typeof record.createdAt !== "string" ||
        !validTime(record.createdAt),
    )
  ) {
    return {
      status: "HOLD",
      reason: "INVALID_RECORD",
      resolutionVersion: SORA_ACTOR_CURRENT_FRESHNESS_V01,
    };
  }

  const selected = [...candidates].sort((a, b) => {
    const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return byTime !== 0 ? byTime : b.id - a.id;
  })[0]!;

  const ageMs = nowMs - Date.parse(selected.createdAt);
  if (ageMs < 0 || ageMs > maxAgeMs) {
    return {
      status: "HOLD",
      reason: "STALE_CANONICAL",
      resolutionVersion: SORA_ACTOR_CURRENT_FRESHNESS_V01,
    };
  }

  return {
    status: "RESOLVED",
    record: selected,
    ageMs,
    resolutionVersion: SORA_ACTOR_CURRENT_FRESHNESS_V01,
  };
}
