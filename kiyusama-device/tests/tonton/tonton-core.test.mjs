import test from 'node:test';
import assert from 'node:assert/strict';
import { processTontonSignal } from '../../src/tonton-core.js';

const signal = { id: 'sig-1', source: 'test' };

function resolved(overrides = {}) {
  return {
    complete: true,
    payload: { message: 'hello' },
    evidence: { resolver: 'test' },
    nextCursor: 'cursor-2',
    ...overrides,
  };
}

function deps(overrides = {}) {
  return {
    claimSignal: async () => ({ claimed: true, claimId: 'claim-1' }),
    resolvePayload: async () => resolved(),
    handoff: async () => ({ accepted: true }),
    commit: async () => {},
    ...overrides,
  };
}

test('CORE-01 — claim -> resolve -> handoff -> commit order', async () => {
  const trace = [];
  const result = await processTontonSignal(signal, deps({
    claimSignal: async () => { trace.push('claim'); return { claimed: true }; },
    resolvePayload: async () => { trace.push('resolve'); return resolved(); },
    handoff: async () => { trace.push('handoff'); return { accepted: true }; },
    commit: async () => { trace.push('commit'); },
  }));
  assert.deepEqual(trace, ['claim', 'resolve', 'handoff', 'commit']);
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.nextCursor, 'cursor-2');
});

test('CORE-02 — resolve failure never reaches handoff or commit', async () => {
  let handedOff = false;
  let committed = false;
  await assert.rejects(processTontonSignal(signal, deps({
    resolvePayload: async () => { throw new Error('resolver down'); },
    handoff: async () => { handedOff = true; },
    commit: async () => { committed = true; },
  })), /resolver down/);
  assert.equal(handedOff, false);
  assert.equal(committed, false);
});

test('CORE-03 — incomplete resolution never reaches handoff or commit', async () => {
  let handedOff = false;
  let committed = false;
  await assert.rejects(processTontonSignal(signal, deps({
    resolvePayload: async () => resolved({ complete: false }),
    handoff: async () => { handedOff = true; },
    commit: async () => { committed = true; },
  })), (error) => error.code === 'TONTON_INCOMPLETE');
  assert.equal(handedOff, false);
  assert.equal(committed, false);
});

test('CORE-04 — rejected handoff never commits', async () => {
  let committed = false;
  await assert.rejects(processTontonSignal(signal, deps({
    handoff: async () => false,
    commit: async () => { committed = true; },
  })), (error) => error.code === 'TONTON_HANDOFF_REJECTED');
  assert.equal(committed, false);
});

test('CORE-05 — commit failure is surfaced', async () => {
  await assert.rejects(processTontonSignal(signal, deps({
    commit: async () => { throw new Error('commit failed'); },
  })), /commit failed/);
});

test('CORE-06 — duplicate claim exits before resolve/handoff/commit', async () => {
  let resolvedCalled = false;
  let handedOff = false;
  let committed = false;
  const result = await processTontonSignal(signal, deps({
    claimSignal: async () => ({ claimed: false }),
    resolvePayload: async () => { resolvedCalled = true; return resolved(); },
    handoff: async () => { handedOff = true; return true; },
    commit: async () => { committed = true; },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.equal(resolvedCalled, false);
  assert.equal(handedOff, false);
  assert.equal(committed, false);
});

test('CORE-07 — claim failure stops all downstream work', async () => {
  let resolvedCalled = false;
  await assert.rejects(processTontonSignal(signal, deps({
    claimSignal: async () => { throw new Error('claim store unavailable'); },
    resolvePayload: async () => { resolvedCalled = true; return resolved(); },
  })), /claim store unavailable/);
  assert.equal(resolvedCalled, false);
});
