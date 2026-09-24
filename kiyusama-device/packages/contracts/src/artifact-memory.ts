import { validateMemoryContinuationRecord, type MemoryContinuationRecord } from './memory-continuation.js';
import { ARTIFACT_TRANSITIONS, traceArtifactLineage, type ArtifactLineageEdge, type ArtifactTransitionType } from './artifact-lineage.js';

export interface ArtifactMemoryRecord extends MemoryContinuationRecord {
  artifact_id: string;
  transition: ArtifactTransitionType;
  observed_at?: string;
}

const isRfc3339 = (v: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v));

export function validateArtifactMemoryRecord(record: ArtifactMemoryRecord): void {
  const base = validateMemoryContinuationRecord(record);
  if (!base.ok) throw new Error('INVALID_MEMORY_CONTINUATION');
  if (!record.artifact_id.trim()) throw new Error('INVALID_ARTIFACT_ID');
  if (!ARTIFACT_TRANSITIONS.includes(record.transition)) throw new Error('INVALID_ARTIFACT_TRANSITION');
  if (record.observed_at !== undefined && !isRfc3339(record.observed_at)) throw new Error('INVALID_OBSERVED_AT');
}

export interface ArtifactRecoveryView {
  artifact_id: string;
  current_memory: ArtifactMemoryRecord | null;
  memory_history: ArtifactMemoryRecord[];
  lineage: ReturnType<typeof traceArtifactLineage>;
  unresolved_descendants: string[];
}

export function resolveArtifactRecoveryView(artifactId: string, records: ArtifactMemoryRecord[], edges: ArtifactLineageEdge[]): ArtifactRecoveryView {
  const relevant = records.filter(record => record.artifact_id === artifactId).sort((a,b)=>a.version-b.version);
  relevant.forEach(validateArtifactMemoryRecord);
  for (let i=1;i<relevant.length;i++) {
    const current = relevant[i];
    const previous = relevant[i-1];
    if (!current || !previous) throw new Error('BROKEN_ARTIFACT_MEMORY_CHAIN');
    if (current.version !== previous.version + 1) throw new Error('BROKEN_ARTIFACT_MEMORY_CHAIN');
    if (Date.parse(current.recorded_at) < Date.parse(previous.recorded_at)) throw new Error('ARTIFACT_MEMORY_TIME_REGRESSION');
  }
  const lineage = traceArtifactLineage(artifactId, edges);
  const knownArtifacts = new Set(records.map(record=>record.artifact_id));
  const unresolved_descendants = lineage.descendants.filter(id=>!knownArtifacts.has(id));
  return {
    artifact_id: artifactId,
    current_memory: relevant.length ? relevant[relevant.length-1] ?? null : null,
    memory_history: relevant,
    lineage,
    unresolved_descendants,
  };
}
