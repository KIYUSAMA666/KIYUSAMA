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

test('CORE-01 — resolve -> handoff -> commit order', async () => {
  const trace = [];
  const result = await processTontonSignal(signal, {
    resolvePayload: async () => { trace.push('resolve'); return resolved(); },
    handoff: async () => { trace.push('handoff'); return { accepted: true }; },
    commit: async () => { trace.push('commit'); },
  });
  assert.deepEqual(trace, ['resolve', 'handoff', 'commit']);
  assert.equal(result.ok, true);
  assert.equal(result.nextCursor, 'cursor-2');
});

test('CORE-02 — resolve failure never reaches handoff or commit', async () => {
  let handedOff = false;
  let committed = false;
  await assert.rejects(processTontonSignal(signal, {
    resolvePayload: async () => { throw new Error('resolver down'); },
    handoff: async () => { handedOff = true; },
    commit: async () => { committed = true; },
  }), /resolver down/);
  assert.equal(handedOff, false);
  assert.equal(committed, false);
});

test('CORE-03 — incomplete resolution never reaches handoff or commit', async () => {
  let handedOff = false;
  let committed = false;
  await assert.rejects(processTontonSignal(signal, {
    resolvePayload: async () => resolved({ complete: false }),
    handoff: async () => { handedOff = true; },
    commit: async () => { committed = true; },
  }), (error) => error.code === 'TONTON_INCOMPLETE');
  assert.equal(handedOff, false);
  assert.equal(committed, false);
});

test('CORE-04 — rejected handoff never commits', async () => {
  let committed = false;
  await assert.rejects(processTontonSignal(signal, {
    resolvePayload: async () => resolved(),
    handoff: async () => false,
    commit: async () => { committed = true; },
  }), (error) => error.code === 'TONTON_HANDOFF_REJECTED');
  assert.equal(committed, false);
});

test('CORE-05 — commit failure is surfaced', async () => {
  await assert.rejects(processTontonSignal(signal, {
    resolvePayload: async () => resolved(),
    handoff: async () => true,
    commit: async () => { throw new Error('commit failed'); },
  }), /commit failed/);
});
