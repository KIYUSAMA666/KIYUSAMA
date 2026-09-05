import type { AuthorityLevel, AuthorityRef } from '../shared/authority.js';
import type { EventId, RouteId, TraceId, AdapterId } from '../shared/ids.js';
import type { WatchEvidenceRef } from '../shared/evidence-ref.js';
import type { Rfc3339Timestamp } from '../shared/timestamps.js';
import type { WatchTagValue } from '../watch/watch-contract.js';

export interface RouteRequest {
  readonly route_id: RouteId;
  readonly event_id: EventId;
  readonly trace_id: TraceId;
  readonly source: string;
  readonly event_type: string;
  readonly tags: Readonly<Record<string, WatchTagValue>>;
  readonly dedupe_key: string;
  readonly requested_capability: string;
  readonly requested_authority_ref: AuthorityRef;
  readonly payload_ref: string;
  readonly watch_evidence_ref: WatchEvidenceRef;
  readonly occurred_at: Rfc3339Timestamp;
  readonly expires_at: Rfc3339Timestamp;
}

export type RouteDecisionCode =
  | 'ROUTED'
  | 'NO_ROUTE'
  | 'UNSUPPORTED_CAPABILITY'
  | 'AUTHORITY_UNRESOLVED'
  | 'EXPIRED'
  | 'FROZEN';

export interface RouteDecision {
  readonly route_id: RouteId;
  readonly event_id: EventId;
  readonly trace_id: TraceId;
  readonly selected_adapter_id: AdapterId | null;
  readonly required_authority: AuthorityLevel;
  readonly risk_class: AuthorityLevel;
  readonly approval_required: boolean;
  readonly decision: RouteDecisionCode;
  readonly reason_code: string;
  readonly expires_at: Rfc3339Timestamp;
}

export const isRouteDecisionFresh = (decision: RouteDecision, now = Date.now()): boolean =>
  Date.parse(decision.expires_at) > now;
