import test from 'node:test';
import assert from 'node:assert/strict';
import { createExistingWakeHandoff } from '../../src/tonton-wake-adapter.js';

const input = {
  signal: { id: 'sig-1', source: 'local-test', dedupeKey: 'local-test:event-1' },
  payload: { message: 'wake' },
  evidence: { resolver: 'unit' },
  nextCursor: 'cursor-2',
};

test('WAKE-01 — maps TONTON payload into provider-neutral existing WAKE contract', async () => {
  const calls = [];
  const handoff = createExistingWakeHandoff({
    dispatchWake: async (request) => {
      calls.push(request);
      return { accepted: true, runId: 'wake-1' };
    },
  });

  const result = await handoff(input);
  assert.equal(result.accepted, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    kind: 'TONTON_WAKE',
    signalId: 'sig-1',
    source: 'local-test',
    dedupeKey: 'local-test:event-1',
    payload: { message: 'wake' },
    evidence: { resolver: 'unit' },
    nextCursor: 'cursor-2',
  });
});

test('WAKE-02 — existing WAKE rejection is surfaced as rejected handoff', async () => {
  const handoff = createExistingWakeHandoff({ dispatchWake: async () => false });
  const result = await handoff(input);
  assert.deepEqual(result, { accepted: false });
});

test('WAKE-03 — concrete storage/runtime implementation is not required', async () => {
  const handoff = createExistingWakeHandoff({ dispatchWake: async () => ({ accepted: true }) });
  await assert.doesNotReject(() => handoff(input));
});

test('WAKE-04 — missing verified existing WAKE binding fails closed', () => {
  assert.throws(
    () => createExistingWakeHandoff(),
    (error) => error.code === 'TONTON_WAKE_CONFIG_ERROR',
  );
});
