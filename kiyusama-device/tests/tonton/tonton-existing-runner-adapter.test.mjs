import test from 'node:test';
import assert from 'node:assert/strict';
import { createExistingRunnerAdapter } from '../../src/tonton-existing-runner-adapter.js';
import { createExistingRunnerSeam } from '../../src/tonton-existing-runner-seam.js';

test('ADAPTER-01 legacy-shaped claim/execute/record maps through seam', async () => {
  const calls = [];
  const adapter = createExistingRunnerAdapter({
    claimTask: async input => {
      calls.push(['claim', input]);
      return { accepted: true, knowledgeEntryId: 91, content: 'mock task', baseBranch: 'main', baseSha: 'abc' };
    },
    executeTask: async input => {
      calls.push(['execute', input]);
      return { accepted: true, status: 'BRANCH_READY', branch: 'codex/mock-91', summary: 'done' };
    },
    recordResult: async input => {
      calls.push(['record', input]);
      return { accepted: true, receipt: 'mock-receipt-91' };
    },
  });
  const run = createExistingRunnerSeam(adapter);
  const result = await run({ kind: 'OS_RUNNER_REQUEST', signalId: 'sig-a1', source: 'tonton' });
  assert.equal(result.accepted, true);
  assert.equal(result.task.taskId, 91);
  assert.equal(result.execution.branch, 'codex/mock-91');
  assert.equal(result.recorded.receipt, 'mock-receipt-91');
  assert.deepEqual(calls.map(([name]) => name), ['claim', 'execute', 'record']);
});

test('ADAPTER-02 claim rejection stops existing runner seam', async () => {
  let executeCalled = false;
  const adapter = createExistingRunnerAdapter({
    claimTask: async () => ({ accepted: false }),
    executeTask: async () => { executeCalled = true; return { accepted: true }; },
    recordResult: async () => ({ accepted: true }),
  });
  const run = createExistingRunnerSeam(adapter);
  const result = await run({ kind: 'OS_RUNNER_REQUEST', signalId: 'sig-a2' });
  assert.deepEqual(result, { accepted: false, stage: 'task_source' });
  assert.equal(executeCalled, false);
});

test('ADAPTER-03 execution rejection never records result', async () => {
  let recordCalled = false;
  const adapter = createExistingRunnerAdapter({
    claimTask: async () => ({ accepted: true, taskId: 'task-a3', content: 'x' }),
    executeTask: async () => ({ accepted: false }),
    recordResult: async () => { recordCalled = true; return { accepted: true }; },
  });
  const run = createExistingRunnerSeam(adapter);
  const result = await run({ kind: 'OS_RUNNER_REQUEST', signalId: 'sig-a3' });
  assert.deepEqual(result, { accepted: false, stage: 'executor' });
  assert.equal(recordCalled, false);
});

test('ADAPTER-04 record rejection surfaces at result sink', async () => {
  const adapter = createExistingRunnerAdapter({
    claimTask: async () => ({ accepted: true, taskId: 'task-a4' }),
    executeTask: async () => ({ accepted: true, status: 'NO_CHANGES' }),
    recordResult: async () => ({ accepted: false }),
  });
  const run = createExistingRunnerSeam(adapter);
  const result = await run({ kind: 'OS_RUNNER_REQUEST', signalId: 'sig-a4' });
  assert.deepEqual(result, { accepted: false, stage: 'result_sink' });
});

test('ADAPTER-05 missing legacy-shaped binding fails closed', () => {
  assert.throws(
    () => createExistingRunnerAdapter({ claimTask: async () => ({}), executeTask: async () => ({}) }),
    /recordResult is required/,
  );
});
