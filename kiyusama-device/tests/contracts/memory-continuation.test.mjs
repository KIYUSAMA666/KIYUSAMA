import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMemoryContinuationRecord } from '../../dist/contracts/index.js';

const base = {
  schema_version: 'kiyusama-memory/2.0-draft1',
  memory_id: 'mem-trash-demon-001',
  subject: 'TRASH_DEMON',
  state: 'FROZEN_PRESERVE_FIRST',
  previous_state: 'RECOVERED',
  cause: 'OS 2.0 completion lock preserves lineage before reactivation',
  evidence_refs: ['github:docs/KIYUSAMA_OS_2_0_RECOVERY_LOCK_2026-09-06.md'],
  version: 1,
  freshness_at: '2026-09-06T18:30:00+09:00',
  source: 'SORA_KIRA_RECOVERY_AUDIT',
  verification_status: 'VERIFIED',
  salience: 'CORE',
  next_action: 'Continue OS 2.0 assembly without invoking TRASH DEMON',
  recorded_at: '2026-09-06T18:30:00+09:00',
};

test('accepts a causal verified memory with evidence and continuation action', () => {
  assert.equal(validateMemoryContinuationRecord(base).ok, true);
});

test('rejects VERIFIED memory without evidence', () => {
  assert.equal(validateMemoryContinuationRecord({ ...base, evidence_refs: [] }).ok, false);
});

test('keeps recollection explicitly INFERRED instead of silently verified', () => {
  const result = validateMemoryContinuationRecord({ ...base, memory_id: 'mem-jimi-001', subject: 'JIMI_TONTON_ALTERNATIVE', verification_status: 'INFERRED', evidence_refs: ['recollection:user-discussion'], salience: 'HIGH' });
  assert.equal(result.ok, true);
});

test('rejects UNKNOWN carrying evidence as though it were already classified', () => {
  assert.equal(validateMemoryContinuationRecord({ ...base, verification_status: 'UNKNOWN' }).ok, false);
});

test('requires causal history and next continuation action', () => {
  assert.equal(validateMemoryContinuationRecord({ ...base, cause: '', next_action: '' }).ok, false);
});

test('requires explicit previous_state field even when no prior state exists', () => {
  assert.equal(validateMemoryContinuationRecord({ ...base, previous_state: null }).ok, true);
  const { previous_state, ...missing } = base;
  assert.equal(validateMemoryContinuationRecord(missing).ok, false);
});
