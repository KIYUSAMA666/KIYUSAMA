import type { AuthorityRef } from '../shared/authority.js';
import type { EventId, TraceId } from '../shared/ids.js';
import type { Rfc3339Timestamp } from '../shared/timestamps.js';

export interface DeliveryEnvelope {
  readonly event_id: EventId;
  readonly source: string;
  readonly target: string;
  readonly payload_ref: string;
  readonly authority: AuthorityRef;
  readonly trace_id: TraceId;
  readonly dedupe_key: string;
  readonly occurred_at: Rfc3339Timestamp;
}
