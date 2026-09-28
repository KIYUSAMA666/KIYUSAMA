import type { MemoryEvidenceRef, MemoryVerificationStatus } from './memory-continuation.js';

export const ARTIFACT_TRANSITIONS = ['BORN','MODIFIED','DECOMPOSED','MIGRATED','REASSEMBLED'] as const;
export type ArtifactTransitionType = (typeof ARTIFACT_TRANSITIONS)[number];

export interface ArtifactLineageEdge {
  schema_version: 'kiyusama-artifact-lineage/2.0-draft1';
  lineage_edge_id: string;
  parent_artifact_id: string;
  child_artifact_ids: string[];
  transition_type: ArtifactTransitionType;
  evidence_refs: MemoryEvidenceRef[];
  verification_status: MemoryVerificationStatus;
  recorded_at: string;
  supersedes?: string;
}

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isRfc3339 = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v));

export function validateArtifactLineageEdge(edge: ArtifactLineageEdge): void {
  if (edge.schema_version !== 'kiyusama-artifact-lineage/2.0-draft1') throw new Error('INVALID_LINEAGE_SCHEMA');
  if (!isNonEmpty(edge.lineage_edge_id) || !isNonEmpty(edge.parent_artifact_id)) throw new Error('INVALID_LINEAGE_ID');
  if (!ARTIFACT_TRANSITIONS.includes(edge.transition_type)) throw new Error('INVALID_LINEAGE_TRANSITION');
  if (!Array.isArray(edge.child_artifact_ids) || edge.child_artifact_ids.length === 0 || edge.child_artifact_ids.some(id => !isNonEmpty(id))) throw new Error('LINEAGE_REQUIRES_CHILDREN');
  if (new Set(edge.child_artifact_ids).size !== edge.child_artifact_ids.length) throw new Error('DUPLICATE_LINEAGE_CHILD');
  if (edge.child_artifact_ids.includes(edge.parent_artifact_id)) throw new Error('LINEAGE_SELF_LOOP');
  if (!isRfc3339(edge.recorded_at)) throw new Error('INVALID_LINEAGE_TIMESTAMP');
  if (edge.verification_status === 'VERIFIED' && edge.evidence_refs.length === 0) throw new Error('VERIFIED_REQUIRES_EVIDENCE');
  if (edge.verification_status === 'CONTRADICTED' && edge.evidence_refs.length < 2) throw new Error('CONTRADICTED_REQUIRES_COMPETING_EVIDENCE');
  if (edge.supersedes !== undefined && !isNonEmpty(edge.supersedes)) throw new Error('INVALID_SUPERSEDES');
}

export interface ArtifactLineageTrace {
  artifact_id: string;
  outgoing: ArtifactLineageEdge[];
  descendants: string[];
}

export function traceArtifactLineage(rootArtifactId: string, edges: ArtifactLineageEdge[]): ArtifactLineageTrace {
  if (!isNonEmpty(rootArtifactId)) throw new Error('INVALID_ARTIFACT_ID');
  edges.forEach(validateArtifactLineageEdge);
  const byParent = new Map<string, ArtifactLineageEdge[]>();
  for (const edge of edges) byParent.set(edge.parent_artifact_id,[...(byParent.get(edge.parent_artifact_id) ?? []),edge]);
  const descendants: string[] = [];
  const visited = new Set<string>([rootArtifactId]);
  const queue = [rootArtifactId];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const edge of byParent.get(parent) ?? []) {
      for (const child of edge.child_artifact_ids) {
        if (visited.has(child)) throw new Error('LINEAGE_CYCLE_DETECTED');
        visited.add(child);
        descendants.push(child);
        queue.push(child);
      }
    }
  }
  return {artifact_id: rootArtifactId,outgoing: byParent.get(rootArtifactId) ?? [],descendants};
}
