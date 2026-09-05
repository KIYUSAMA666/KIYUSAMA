import type { AuthorityRef } from '../shared/authority.js';
import type { EventId, TraceId, WakeId } from '../shared/ids.js';
import type { WatchEvidenceRef } from '../shared/evidence-ref.js';
import type { Rfc3339Timestamp } from '../shared/timestamps.js';

export interface WakeRequest {
  readonly wake_id: WakeId;
  readonly wake_type: string;
  readonly event_id: EventId;
  readonly trace_id: TraceId;
  readonly source: string;
  readonly dedupe_key: string;
  readonly requested_capability: string;
  /** Requested/unverified only. WAKE must not authorize from this field. */
  readonly authority_ref: AuthorityRef;
  readonly payload_ref: string;
  readonly watch_evidence_ref: WatchEvidenceRef;
  readonly occurred_at: Rfc3339Timestamp;
  readonly expires_at: Rfc3339Timestamp;
}

export type WakeState =
  | 'WAKE_REQUESTED'
  | 'WAKE_ACCEPTED'
  | 'READY'
  | 'WAKE_REJECTED'
  | 'WAKE_TIMEOUT'
  | 'WAKE_FAILED'
  | 'FROZEN';
