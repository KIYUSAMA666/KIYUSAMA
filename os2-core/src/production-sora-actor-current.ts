import {
  resolveFreshSoraActorCanonical,
  type SoraActorCanonicalRecord,
  type SoraActorFreshnessDecision,
} from "./sora-actor-current-freshness.js";

export interface ProductionKnowledgeEntryMetadata {
  id: number;
  created_by: string;
  created_at: string;
  status: string;
  conflict_flag: boolean;
  subject_key?: string | null;
  title?: string | null;
}

export interface ProductionActorMetadataReadClient {
  readActorMetadata(createdBy: string): Promise<ReadonlyArray<ProductionKnowledgeEntryMetadata>>;
}

export type ProductionSoraActorCurrentDecision =
  | SoraActorFreshnessDecision
  | { status: "HOLD"; reason: "BACKEND_FAILURE" | "INVALID_SURFACE_RECORD" };

function actorId(room: number): string | null {
  if (!Number.isInteger(room) || room < 1 || room > 99) return null;
  return `SORA_${String(room).padStart(2, "0")}`;
}

function adapt(
  value: ProductionKnowledgeEntryMetadata,
): SoraActorCanonicalRecord | null {
  if (
    !Number.isInteger(value.id) ||
    typeof value.created_by !== "string" ||
    typeof value.created_at !== "string" ||
    typeof value.status !== "string" ||
    typeof value.conflict_flag !== "boolean"
  ) return null;

  return {
    id: value.id,
    createdBy: value.created_by,
    createdAt: value.created_at,
    status: value.status,
    conflictFlag: value.conflict_flag,
    subjectKey: value.subject_key ?? null,
    title: value.title ?? null,
  };
}

/**
 * Production integration boundary for actor CURRENT freshness.
 *
 * The read client owns the existing Production COMMON MEMORY transport.
 * This adapter only validates/normalizes metadata and delegates authority
 * selection to the fail-closed resolver. It performs no write and no content
 * load.
 */
export async function resolveProductionSoraActorCurrent(
  client: ProductionActorMetadataReadClient,
  room: number,
  nowMs: number,
  maxAgeMs: number,
): Promise<ProductionSoraActorCurrentDecision> {
  const expectedActor = actorId(room);
  if (expectedActor === null) {
    return { status: "HOLD", reason: "INVALID_SURFACE_RECORD" };
  }

  try {
    const raw = await client.readActorMetadata(expectedActor);
    if (!Array.isArray(raw)) {
      return { status: "HOLD", reason: "INVALID_SURFACE_RECORD" };
    }

    const adapted: SoraActorCanonicalRecord[] = [];
    for (const entry of raw) {
      const record = adapt(entry);
      if (record === null || record.createdBy !== expectedActor) {
        return { status: "HOLD", reason: "INVALID_SURFACE_RECORD" };
      }
      adapted.push(record);
    }

    return resolveFreshSoraActorCanonical(adapted, room, nowMs, maxAgeMs);
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }
}
