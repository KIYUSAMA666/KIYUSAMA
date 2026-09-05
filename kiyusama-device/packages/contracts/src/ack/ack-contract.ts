import type { AckId, AdapterId, DeliveryAttemptId, EventId, RouteId, TraceId } from '../shared/ids.js';
import type { Rfc3339Timestamp } from '../shared/timestamps.js';

export interface AckReceipt {
  readonly ack_id: AckId;
  readonly event_id: EventId;
  readonly trace_id: TraceId;
  readonly route_id: RouteId;
  readonly delivery_attempt_id: DeliveryAttemptId;
  readonly adapter_id: AdapterId;
  readonly ack_status: string;
  readonly ack_code: string;
  readonly ack_ref: string;
  readonly occurred_at: Rfc3339Timestamp;
  readonly expires_at: Rfc3339Timestamp;
}

export type AckState =
  | 'ACK_PENDING'
  | 'ACK_RECEIVED'
  | 'ACK_VALIDATED'
  | 'ACKNOWLEDGED'
  | 'ACK_INVALID'
  | 'ACK_MISMATCH'
  | 'ACK_EXPIRED'
  | 'ACK_TIMEOUT'
  | 'REPLAY_REJECTED'
  | 'DISCARDED_LATE'
  | 'FROZEN';
