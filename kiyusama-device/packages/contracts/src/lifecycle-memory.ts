import type { MemoryEvidenceRef, MemoryVerificationStatus } from './memory-continuation.js';

export const LIFECYCLE_STATES = [
  'BORN',
  'OBSERVED_ACTIVE',
  'ANALYZED',
  'DECOMPOSED',
  'MIGRATED',
  'RECONSTRUCTED',
  'LAST_SEEN_AS_WHOLE',
  'CURRENT_TRACE',
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export interface LifecycleTransition {
  lifecycle_id: string;
  subject: string;
  sequence: number;
  state: LifecycleState;
  previous_state: LifecycleState | null;
  occurred_at: string;
  actor: string;
  cause: string;
  evidence_refs: MemoryEvidenceRef[];
  verification_status: MemoryVerificationStatus;
  supersedes_sequence: number | null;
  destination_ref?: string;
}

export interface LifecycleCurrentState {
  current: LifecycleTransition;
  history: LifecycleTransition[];
}

const rfc3339 = (v: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v));

export function validateLifecycleTransition(x: LifecycleTransition): void {
  if (!x.lifecycle_id.trim() || !x.subject.trim() || !x.actor.trim() || !x.cause.trim()) throw new Error('INVALID_LIFECYCLE_TRANSITION');
  if (!Number.isInteger(x.sequence) || x.sequence < 1 || !LIFECYCLE_STATES.includes(x.state) || !rfc3339(x.occurred_at)) throw new Error('INVALID_LIFECYCLE_TRANSITION');
  if (x.verification_status === 'VERIFIED' && x.evidence_refs.length === 0) throw new Error('VERIFIED_REQUIRES_EVIDENCE');
  if (x.verification_status === 'CONTRADICTED' && x.evidence_refs.length < 2) throw new Error('CONTRADICTED_REQUIRES_COMPETING_EVIDENCE');
  if (x.state === 'MIGRATED' && !x.destination_ref?.trim()) throw new Error('MIGRATION_REQUIRES_DESTINATION');
}

export function appendLifecycleTransition(history: LifecycleTransition[], next: LifecycleTransition): LifecycleTransition[] {
  validateLifecycleTransition(next);
  const ordered = [...history].sort((a,b)=>a.sequence-b.sequence);
  const last = ordered.at(-1);
  if (last) {
    if (next.lifecycle_id !== last.lifecycle_id || next.subject !== last.subject) throw new Error('LIFECYCLE_IDENTITY_MISMATCH');
    if (next.sequence !== last.sequence + 1) throw new Error('NON_CONTIGUOUS_LIFECYCLE_SEQUENCE');
    if (next.previous_state !== last.state) throw new Error('LIFECYCLE_PREVIOUS_STATE_MISMATCH');
    if (Date.parse(next.occurred_at) < Date.parse(last.occurred_at)) throw new Error('LIFECYCLE_TIME_REGRESSION');
  } else if (next.sequence !== 1 || next.previous_state !== null) throw new Error('INVALID_LIFECYCLE_ORIGIN');
  return [...ordered, next];
}

export function resolveLifecycleCurrentState(history: LifecycleTransition[]): LifecycleCurrentState {
  if (history.length === 0) throw new Error('EMPTY_LIFECYCLE');
  const ordered = [...history].sort((a,b)=>a.sequence-b.sequence);
  ordered.forEach(validateLifecycleTransition);
  for (let i=1;i<ordered.length;i++) {
    if (ordered[i].sequence !== ordered[i-1].sequence + 1 || ordered[i].previous_state !== ordered[i-1].state) throw new Error('BROKEN_LIFECYCLE_CHAIN');
    if (Date.parse(ordered[i].occurred_at) < Date.parse(ordered[i-1].occurred_at)) throw new Error('LIFECYCLE_TIME_REGRESSION');
  }
  return { current: ordered[ordered.length-1], history: ordered };
}
