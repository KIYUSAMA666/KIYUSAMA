import type { AuthorityRef } from '../shared/authority.js';
import type { EvidenceRef } from '../shared/evidence-ref.js';
import type { AckId, AdapterId, DeliveryAttemptId, EventId, RouteId, TraceId, VerifierId, VerifyId } from '../shared/ids.js';
import type { Rfc3339Timestamp } from '../shared/timestamps.js';
import type { EscalationAction } from '../shared/common-result.js';

export interface VerifyRequest {
  readonly verify_id: VerifyId;
  readonly event_id: EventId;
  readonly trace_id: TraceId;
  readonly route_id: RouteId;
  readonly delivery_attempt_id: DeliveryAttemptId;
  readonly adapter_id: AdapterId;
  readonly ack_id: AckId;
  readonly expected_outcome_ref: string;
  readonly verification_policy_id: string;
  readonly authority_ref: AuthorityRef;
  readonly occurred_at: Rfc3339Timestamp;
  readonly expires_at: Rfc3339Timestamp;
}

export type VerificationStatus = 'VERIFIED' | 'VERIFY_FAILED' | 'VERIFY_INCONCLUSIVE';

export interface VerifyResult {
  readonly verify_id: VerifyId;
  readonly event_id: EventId;
  readonly trace_id: TraceId;
  readonly delivery_attempt_id: DeliveryAttemptId;
  readonly verifier_id: VerifierId;
  readonly verification_status: VerificationStatus;
  readonly result_code: string;
  readonly evidence_ref: EvidenceRef;
  readonly verified_at: Rfc3339Timestamp;
  readonly expires_at: Rfc3339Timestamp;
}

export const verificationOutcomeAction = (status: VerificationStatus): EscalationAction =>
  status === 'VERIFY_INCONCLUSIVE' ? 'ESCALATE_KIRA_KIYUSAMA' : 'NONE';
