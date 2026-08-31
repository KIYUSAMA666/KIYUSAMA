import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidUniversalResultContainer,
  validateUniversalResultContainer,
} from '../../dist/contracts/index.js';

const valid = {
  schema_version: 'device-result/0.1',
  device_event_id: 'evt_device_001',
  delivery_event_id: 'ret_001',
  hop: 1,
  provider: 'anthropic_managed_agents',
  provider_execution: {
    session_id: 'sesn_001',
    deployment_run_id: 'drun_001',
  },
  status: 'SUCCESS',
  output: {
    format: 'text',
    text: 'result',
    structured: null,
  },
  metrics: {
    duration_ms: 4200,
    turns_count: 1,
  },
  error: null,
  completed_at: '2026-08-31T06:00:00+09:00',
};

test('accepts a valid SUCCESS container', () => {
  assert.equal(isValidUniversalResultContainer(valid), true);
  assert.deepEqual(validateUniversalResultContainer(valid), { ok: true, value: valid });
});

test('accepts a valid FAILED container with unified error', () => {
  const failed = {
    ...valid,
    status: 'FAILED',
    output: { ...valid.output, text: '' },
    error: { code: 'PROVIDER_FAILURE', message: 'provider failed' },
  };
  assert.equal(isValidUniversalResultContainer(failed), true);
});

test('requires a distinct non-empty delivery_event_id', () => {
  const invalid = { ...valid, delivery_event_id: '' };
  const result = validateUniversalResultContainer(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === 'delivery_event_id'));
});

test('rejects invalid hop values', () => {
  for (const hop of [0, 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(isValidUniversalResultContainer({ ...valid, hop }), false);
  }
});

test('rejects unknown status and format', () => {
  assert.equal(isValidUniversalResultContainer({ ...valid, status: 'IDLED' }), false);
  assert.equal(
    isValidUniversalResultContainer({ ...valid, output: { ...valid.output, format: 'xml' } }),
    false,
  );
});

test('rejects missing provider_execution object', () => {
  const { provider_execution: _ignored, ...without } = valid;
  assert.equal(isValidUniversalResultContainer(without), false);
});

test('rejects invalid metrics', () => {
  assert.equal(isValidUniversalResultContainer({ ...valid, metrics: { duration_ms: -1 } }), false);
  assert.equal(isValidUniversalResultContainer({ ...valid, metrics: { duration_ms: 1, turns_count: -1 } }), false);
});

test('rejects malformed or timezone-less completed_at', () => {
  assert.equal(isValidUniversalResultContainer({ ...valid, completed_at: 'not-a-date' }), false);
  assert.equal(isValidUniversalResultContainer({ ...valid, completed_at: '2026-08-31T06:00:00' }), false);
});

test('enforces SUCCESS => error null', () => {
  assert.equal(
    isValidUniversalResultContainer({
      ...valid,
      error: { code: 'SHOULD_NOT_EXIST', message: 'bad invariant' },
    }),
    false,
  );
});

test('enforces non-SUCCESS => error present', () => {
  assert.equal(isValidUniversalResultContainer({ ...valid, status: 'TIMEOUT', error: null }), false);
});

test('supports multiple legal return deliveries under one root device_event_id', () => {
  const hop2 = {
    ...valid,
    delivery_event_id: 'ret_002',
    hop: 2,
    provider: 'openai',
    provider_execution: { run_id: 'run_002' },
  };
  assert.equal(valid.device_event_id, hop2.device_event_id);
  assert.notEqual(valid.delivery_event_id, hop2.delivery_event_id);
  assert.equal(isValidUniversalResultContainer(valid), true);
  assert.equal(isValidUniversalResultContainer(hop2), true);
});
