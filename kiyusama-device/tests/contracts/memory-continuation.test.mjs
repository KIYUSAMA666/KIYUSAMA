import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_CONTINUATION_HARD_RULES,
  MEMORY_CONTINUATION_REQUIRED_FIELDS,
  MEMORY_RECOVERY_FAILURE_MODES,
  MEMORY_VERIFICATION_STATUSES,
  validateMemoryCausalDiff,
  validateMemoryContinuationRecord,
} from '../../dist/contracts/memory-continuation.js';

const base = {
  schema_version: 'kiyusama-memory-continuation/2.0-draft1',
  memory_id: 'mem-001',
  subject: 'TONTON topology',
  state: 'LEGACY_7_STAGE_PRESERVED_NOT_CANONICAL',
  previous_state: 'LEGACY_7_STAGE_CANONICAL',
  cause: 'Independent audit found contradiction between reopened concept and canonical stage lock',
  evidence_refs: [
    { ref: 'commit:03097a9139918cea1e9e3a2b69051e7fcd89dc47', source: 'GitHub' },
  ],
  version: 2,
  freshness_at: '2026-09-06T18:30:00+09:00',
  source: 'GitHub verified branch state',
  verification_status: 'VERIFIED',
  salience: 'CORE',
  next_action: 'Continue core reassembly without restoring seven-stage canonical lock',
  recorded_at: '2026-09-06T18:31:00+09:00',
};

test('memory contract constants match the locked JSON contract', () => {
  assert.deepEqual(MEMORY_CONTINUATION_REQUIRED_FIELDS, [
    'memory_id', 'subject', 'state', 'previous_state', 'cause', 'evidence_refs',
    'version', 'freshness_at', 'source', 'verification_status', 'salience',
    'next_action', 'recorded_at',
  ]);
  assert.deepEqual(MEMORY_VERIFICATION_STATUSES, [
    'VERIFIED', 'PARTIAL', 'INFERRED', 'UNKNOWN', 'CONTRADICTED',
  ]);
  assert.ok(MEMORY_CONTINUATION_HARD_RULES.includes('NO_DESTRUCTIVE_RUNTIME_ACTION_DURING_OS_2_0_COMPLETION_LOCK'));
  assert.ok(MEMORY_RECOVERY_FAILURE_MODES.includes('REDISCOVER_CRITICAL_ARTIFACT_AS_NEW'));
});

test('accepts a fully evidenced verified memory continuation record', () => {
  assert.equal(validateMemoryContinuationRecord(base).ok, true);
});

test('rejects VERIFIED memory without evidence', () => {
  assert.equal(validateMemoryContinuationRecord({ ...base, evidence_refs: [] }).ok, false);
});

test('rejects missing required causal state fields', () => {
  const { cause, ...withoutCause } = base;
  assert.equal(validateMemoryContinuationRecord(withoutCause).ok, false);
});

test('keeps inferred memory labeled as inferred instead of fact', () => {
  assert.equal(validateMemoryContinuationRecord({ ...base, verification_status: 'INFERRED', source: 'FACT' }).ok, false);
});

test('requires competing evidence for CONTRADICTED state', () => {
  assert.equal(validateMemoryContinuationRecord({ ...base, verification_status: 'CONTRADICTED' }).ok, false);
  assert.equal(validateMemoryContinuationRecord({
    ...base,
    verification_status: 'CONTRADICTED',
    evidence_refs: [
      { ref: 'evidence:old', source: 'legacy' },
      { ref: 'evidence:new', source: 'audit' },
    ],
  }).ok, true);
});

test('validates causal diff required for write-back', () => {
  assert.equal(validateMemoryCausalDiff({
    before_state: 'A',
    after_state: 'B',
    cause: 'verified transition',
    evidence_refs: [{ ref: 'commit:abc123' }],
    actor: 'SORA',
    timestamp: '2026-09-06T18:35:00+09:00',
  }).ok, true);
});
