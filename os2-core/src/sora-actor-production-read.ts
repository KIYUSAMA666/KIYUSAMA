import {
  resolveFreshSoraActorCanonical,
  type SoraActorCanonicalRecord,
  type SoraActorFreshnessDecision,
} from "./sora-actor-current-freshness.js";

export interface ProductionKnowledgeEntryRow {
  id: unknown;
  created_by: unknown;
  created_at: unknown;
  status: unknown;
  conflict_flag: unknown;
  subject_key?: unknown;
  title?: unknown;
}

export interface SoraActorKnowledgeReadClient {
  readKnowledgeEntries(): Promise<ReadonlyArray<ProductionKnowledgeEntryRow>>;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Read-only boundary from Production COMMON MEMORY rows into the actor
 * freshness resolver. It grants no CURRENT or execution authority.
 *
 * Deliberately preserves malformed required fields as invalid values so the
 * resolver fails closed instead of silently repairing Production evidence.
 */
export function mapProductionKnowledgeRows(
  rows: ReadonlyArray<ProductionKnowledgeEntryRow>,
): ReadonlyArray<SoraActorCanonicalRecord> {
  return rows.map((row) => ({
    id: row.id as number,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    status: row.status as string,
    conflictFlag: row.conflict_flag as boolean,
    subjectKey: optionalString(row.subject_key),
    title: optionalString(row.title),
  }));
}

export async function resolveProductionSoraActorExperience(
  client: SoraActorKnowledgeReadClient,
  room: number,
  nowMs: number,
  maxAgeMs: number,
): Promise<SoraActorFreshnessDecision | { status: "HOLD"; reason: "BACKEND_FAILURE" }> {
  try {
    const rows = await client.readKnowledgeEntries();
    return resolveFreshSoraActorCanonical(
      mapProductionKnowledgeRows(rows),
      room,
      nowMs,
      maxAgeMs,
    );
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }
}
