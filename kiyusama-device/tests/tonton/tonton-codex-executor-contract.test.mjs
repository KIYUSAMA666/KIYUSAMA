import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexExecutorContract } from '../../src/tonton-codex-executor-contract.js';

test('EXECUTOR-01 maps task into injected Codex executor with guards', async () => {
  let seen;
  const executeTask = createCodexExecutorContract({
    executeCodex: async input => {
      seen = input;
      return { accepted: true, status: 'BRANCH_READY', branch: 'mock/branch', summary: 'ok', evidence: 'mock-evidence' };
    },
  });

  const result = await executeTask({
    signalId: 'sig-exec-1',
    taskId: 'task-1',
    content: 'make harmless change',
    baseBranch: 'main',
    baseSha: 'abc123',
  });

  assert.equal(result.accepted, true);
  assert.equal(result.status, 'BRANCH_READY');
  assert.equal(result.branch, 'mock/branch');
  assert.equal(seen.guard.approvalPolicy, 'never');
  assert.equal(seen.guard.sandboxMode, 'workspace-write');
  assert.deepEqual(seen.guard.protectedPaths, ['.github', '.codex']);
});

test('EXECUTOR-02 rejected executor is surfaced without fabrication', async () => {
  const executeTask = createCodexExecutorContract({ executeCodex: async () => ({ accepted: false }) });
  const result = await executeTask({ signalId: 'sig-exec-2', taskId: 'task-2', content: 'x' });
  assert.deepEqual(result, { accepted: false });
});

test('EXECUTOR-03 missing concrete executor fails closed', () => {
  assert.throws(() => createCodexExecutorContract(), /executeCodex is required/);
});

test('EXECUTOR-04 invalid task is rejected before executor call', async () => {
  let called = false;
  const executeTask = createCodexExecutorContract({ executeCodex: async () => { called = true; return { accepted: true }; } });
  await assert.rejects(() => executeTask({ signalId: 'sig-exec-4', taskId: 'task-4', content: '' }), /task content is required/);
  assert.equal(called, false);
});
