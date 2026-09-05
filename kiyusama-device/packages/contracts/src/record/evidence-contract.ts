import type { AuthorityRef } from '../shared/authority.js';
import type { EvidenceId, EventId, TraceId } from '../shared/ids.js';
import type { SourceEvidenceRef } from '../shared/evidence-ref.js';
import type { Rfc3339Timestamp } from '../shared/timestamps.js';

export interface EvidencePackage {
  readonly evidence_id: EvidenceId;
  readonly event_id: EventId;
  readonly trace_id: TraceId;
  readonly stage: string;
  readonly actor: string;
  readonly result: string;
  readonly timestamp: Rfc3339Timestamp;
  readonly authority_ref: AuthorityRef;
  readonly approval_ref: string | null;
  readonly source_evidence_ref: SourceEvidenceRef;
  readonly integrity_hash: string;
  readonly sanitized: true;
}

export type StoredEvidenceStatus = 'STORE_REQUESTED' | 'STORED' | 'STORED_VERIFIED' | 'STORE_FAILED' | 'FROZEN';
