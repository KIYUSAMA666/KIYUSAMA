import test from 'node:test';
import assert from 'node:assert/strict';
import { createExistingRunnerSeam } from '../../src/tonton-existing-runner-seam.js';

test('SEAM-01 maps OS_RUNNER_REQUEST through TaskSource -> Executor -> ResultSink', async () => {
  const calls = [];
  const run = createExistingRunnerSeam({
    taskSource: async input => {
      calls.push(['source', input]);
      return { accepted: true, taskId: 'task-1', contentRef: 'mock://task-1' };
    },
    executor: async input => {
      calls.push(['executor', input]);
      return { accepted: true, resultRef: 'mock://result-1' };
    },
    resultSink: async input => {
      calls.push(['sink', input]);
      return { accepted: true, receipt: 'mock-receipt-1' };
    },
  });

  const result = await run({
    kind: 'OS_RUNNER_REQUEST',
    signalId: 'sig-1',
    source: 'tonton',
    dedupeKey: 'd-1',
    hint: 'wake only',
  });

  assert.equal(result.accepted, true);
  assert.equal(result.stage, 'complete');
  assert.deepEqual(calls.map(([name]) => name), ['source', 'executor', 'sink']);
});

test('SEAM-02 stops before executor when TaskSource rejects', async () => {
  let executorCalled = false;
  const run = createExistingRunnerSeam({
    taskSource: async () => ({ accepted: false }),
    executor: async () => { executorCalled = true; return { accepted: true }; },
    resultSink: async () => ({ accepted: true }),
  });
  const result = await run({ kind: 'OS_RUNNER_REQUEST', signalId: 'sig-2' });
  assert.deepEqual(result, { accepted: false, stage: 'task_source' });
  assert.equal(executorCalled, false);
});

test('SEAM-03 stops before ResultSink when Executor rejects', async () => {
  let sinkCalled = false;
  const run = createExistingRunnerSeam({
    taskSource: async () => ({ accepted: true, taskId: 'task-3' }),
    executor: async () => ({ accepted: false }),
    resultSink: async () => { sinkCalled = true; return { accepted: true }; },
  });
  const result = await run({ kind: 'OS_RUNNER_REQUEST', signalId: 'sig-3' });
  assert.deepEqual(result, { accepted: false, stage: 'executor' });
  assert.equal(sinkCalled, false);
});

test('SEAM-04 rejects invalid request before components execute', async () => {
  let called = false;
  const run = createExistingRunnerSeam({
    taskSource: async () => { called = true; return { accepted: true }; },
    executor: async () => ({ accepted: true }),
    resultSink: async () => ({ accepted: true }),
  });
  await assert.rejects(() => run({ kind: 'WRONG', signalId: 'sig-4' }), /OS_RUNNER_REQUEST is required/);
  assert.equal(called, false);
});

test('SEAM-05 missing injected component fails closed', () => {
  assert.throws(
    () => createExistingRunnerSeam({ taskSource: async () => ({}), executor: async () => ({}) }),
    /resultSink is required/,
  );
});
