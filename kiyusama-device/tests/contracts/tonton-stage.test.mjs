import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_TONTON_STAGES,
  validateLegacyTontonStageRecord,
} from '../../dist/contracts/index.js';

const base = {
  schema_version: 'tonton-stage/legacy-7stage-v1',
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

test('legacy seven-stage vocabulary remains readable without becoming OS 2.0 canonical topology', () => {
  assert.deepEqual(LEGACY_TONTON_STAGES, [
    'WATCH', 'WAKE', 'ROUTE', 'DELIVER', 'ACK', 'VERIFY', 'RECORD',
  ]);
});

test('accepts a valid legacy WATCH record', () => {
  assert.equal(validateLegacyTontonStageRecord(base).ok, true);
});

test('rejects legacy WATCH with a previous stage', () => {
  assert.equal(validateLegacyTontonStageRecord({ ...base, previous_stage: 'RECORD' }).ok, false);
});

test('accepts legacy-compatible ACK skip while preserving evidence', () => {
  const result = validateLegacyTontonStageRecord({
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

test('requires evidence for successful legacy VERIFY', () => {
  const result = validateLegacyTontonStageRecord({
    ...base,
    event_id: 'event-verify-001',
    stage: 'VERIFY',
    previous_stage: 'ACK',
    next_stage: 'RECORD',
    evidence_ref: null,
  });
  assert.equal(result.ok, false);
});

test('requires a failure reason when a legacy stage fails', () => {
  assert.equal(validateLegacyTontonStageRecord({ ...base, status: 'FAILED', failure_reason: null }).ok, false);
});

test('legacy RECORD may terminate or roll into WATCH', () => {
  assert.equal(validateLegacyTontonStageRecord({ ...base, event_id: 'event-record-001', stage: 'RECORD', previous_stage: 'VERIFY', next_stage: null, evidence_ref: 'audit:record:1' }).ok, true);
  assert.equal(validateLegacyTontonStageRecord({ ...base, event_id: 'event-record-002', stage: 'RECORD', previous_stage: 'VERIFY', next_stage: 'WATCH', evidence_ref: 'audit:record:2' }).ok, true);
});
