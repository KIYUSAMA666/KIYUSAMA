import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TONTON_STAGES,
  validateTontonStageRecord,
} from '../../dist/contracts/index.js';

const base = {
  schema_version: 'tonton-stage/2.0',
  flow_id: 'flow-001',
  event_id: 'event-001',
  stage: 'WATCH',
  actor: 'SORA',
  target: 'TONTON',
  previous_stage: null,
  status: 'SUCCESS',
  evidence_ref: 'audit:watch:1',
  created_at: '2026-09-06T17:55:00+09:00',
  next_stage: 'WAKE',
  failure_reason: null,
  legacy_ref: 'gmail-pubsub-adapter-v1',
};

test('canonical TONTON stage order is locked', () => {
  assert.deepEqual(TONTON_STAGES, [
    'WATCH',
    'WAKE',
    'ROUTE',
    'DELIVER',
    'ACK',
    'VERIFY',
    'RECORD',
  ]);
});

test('accepts a valid WATCH stage record', () => {
  const result = validateTontonStageRecord(base);
  assert.equal(result.ok, true);
});

test('rejects WATCH with a previous stage', () => {
  const result = validateTontonStageRecord({ ...base, previous_stage: 'RECORD' });
  assert.equal(result.ok, false);
});

test('accepts legacy-compatible ACK skip while preserving stage record', () => {
  const result = validateTontonStageRecord({
    ...base,
    event_id: 'event-ack-001',
    stage: 'ACK',
    previous_stage: 'DELIVER',
    next_stage: 'VERIFY',
    status: 'SKIPPED_COMPAT',
    evidence_ref: 'legacy:replied-terminal',
    legacy_ref: 'agent_messages.status=REPLIED',
  });
  assert.equal(result.ok, true);
});

test('requires evidence for successful VERIFY', () => {
  const result = validateTontonStageRecord({
    ...base,
    event_id: 'event-verify-001',
    stage: 'VERIFY',
    previous_stage: 'ACK',
    next_stage: 'RECORD',
    evidence_ref: null,
  });
  assert.equal(result.ok, false);
});

test('requires a failure reason when a stage fails', () => {
  const result = validateTontonStageRecord({
    ...base,
    status: 'FAILED',
    failure_reason: null,
  });
  assert.equal(result.ok, false);
});

test('RECORD may terminate the loop', () => {
  const result = validateTontonStageRecord({
    ...base,
    event_id: 'event-record-001',
    stage: 'RECORD',
    previous_stage: 'VERIFY',
    next_stage: null,
    evidence_ref: 'audit:record:1',
  });
  assert.equal(result.ok, true);
});

test('RECORD may roll into the next WATCH', () => {
  const result = validateTontonStageRecord({
    ...base,
    event_id: 'event-record-002',
    stage: 'RECORD',
    previous_stage: 'VERIFY',
    next_stage: 'WATCH',
    evidence_ref: 'audit:record:2',
  });
  assert.equal(result.ok, true);
});
