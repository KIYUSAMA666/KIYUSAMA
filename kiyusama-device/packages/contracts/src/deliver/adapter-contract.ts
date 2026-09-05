import type { AdapterId, DeliveryAttemptId, EventId, TraceId } from '../shared/ids.js';
import type { EvidenceRef } from '../shared/evidence-ref.js';
import type { Rfc3339Timestamp } from '../shared/timestamps.js';

export type DeliveryStatus = 'DELIVERY_ATTEMPTED' | 'ACKNOWLEDGED' | 'DELIVERY_FAILED';

export interface AdapterResult {
  readonly event_id: EventId;
  readonly trace_id: TraceId;
  readonly delivery_attempt_id: DeliveryAttemptId;
  readonly adapter_id: AdapterId;
  readonly delivery_status: DeliveryStatus;
  readonly ack_ref: string | null;
  readonly error_code: string | null;
  readonly evidence_ref: EvidenceRef | null;
  readonly completed_at: Rfc3339Timestamp;
}

const ADAPTER_RESULT_KEYS = new Set([
  'event_id','trace_id','delivery_attempt_id','adapter_id','delivery_status',
  'ack_ref','error_code','evidence_ref','completed_at',
]);

export const adapterResultHasAuthorityOverride = (value: Record<string, unknown>): boolean =>
  Object.keys(value).some((key) => !ADAPTER_RESULT_KEYS.has(key) && key === 'authority');
