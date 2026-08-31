import test from 'node:test';
import assert from 'node:assert/strict';
import { createExistingWakeHandoff } from '../../src/tonton-wake-adapter.js';
import { createOsRunnerDispatch } from '../../src/tonton-os-runner-contract.js';

const wakeRequest = {
  signal: { id: 'proof-01', source: 'github', dedupeKey: 'd1' },
  payload: { hint: 'backend-free-proof' },
  evidence: { ack: true },
  nextCursor: null,
};

test('OSRUNNER-01: GitHub ACK-side TONTON wake reaches injected OS runner contract', async () => {
  const seen = [];
  const dispatchWake = createOsRunnerDispatch({
    runOs: async (request) => {
      seen.push(request);
      return { accepted: true, mode: 'mock-only' };
    },
  });
  const handoff = createExistingWakeHandoff({ dispatchWake });
  const result = await handoff(wakeRequest);

  assert.equal(result.accepted, true);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], {
    kind: 'OS_RUNNER_REQUEST',
    sourceKind: 'TONTON_WAKE',
    signalId: 'proof-01',
    source: 'github',
    dedupeKey: 'd1',
    hint: 'backend-free-proof',
  });
});

test('OSRUNNER-02: runner rejection stops the handoff', async () => {
  const dispatchWake = createOsRunnerDispatch({ runOs: async () => ({ accepted: false }) });
  const handoff = createExistingWakeHandoff({ dispatchWake });
  const result = await handoff(wakeRequest);
  assert.equal(result.accepted, false);
});

test('OSRUNNER-03: missing concrete runner binding fails closed', () => {
  assert.throws(() => createOsRunnerDispatch(), /runOs is required/);
});

test('OSRUNNER-04: invalid wake request is rejected before runner execution', async () => {
  let calls = 0;
  const dispatchWake = createOsRunnerDispatch({ runOs: async () => { calls += 1; return { accepted: true }; } });
  await assert.rejects(() => dispatchWake({ kind: 'WRONG', signalId: 'x' }), /TONTON_WAKE request is required/);
  assert.equal(calls, 0);
});
