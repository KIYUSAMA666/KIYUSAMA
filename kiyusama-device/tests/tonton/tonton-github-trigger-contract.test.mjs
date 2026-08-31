import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTontonTriggerArtifact,
  dispatchTontonGithubTrigger,
  TontonGithubTriggerError,
} from '../../src/tonton-github-trigger-contract.js';

test('GITHUB-TRIGGER-01 builds .codex/trigger artifact from TONTON signal', () => {
  const artifact = buildTontonTriggerArtifact({
    id: 'mail:abc/123',
    source: 'mail',
    dedupeKey: 'dedupe-1',
    occurredAt: '2026-08-31T06:00:00Z',
    hint: { kind: 'wake-only' },
  });

  assert.equal(artifact.path, '.codex/trigger/tonton-mail_abc_123.json');
  const body = JSON.parse(artifact.content);
  assert.equal(body.type, 'TONTON_WAKE');
  assert.equal(body.signalId, 'mail:abc/123');
  assert.equal(body.source, 'mail');
  assert.equal(body.dedupeKey, 'dedupe-1');
});

test('GITHUB-TRIGGER-02 fails closed without verified dispatcher', async () => {
  await assert.rejects(
    () => dispatchTontonGithubTrigger({ id: 'sig-1', source: 'test' }),
    (err) => err instanceof TontonGithubTriggerError && err.code === 'TONTON_TRIGGER_DISPATCH_UNVERIFIED',
  );
});

test('GITHUB-TRIGGER-03 dispatches only through injected verified dispatcher', async () => {
  const calls = [];
  const result = await dispatchTontonGithubTrigger(
    { id: 'sig-2', source: 'test' },
    {
      dispatchTrigger: async (artifact, signal) => {
        calls.push({ artifact, signal });
        return { accepted: true, ref: 'dry-run' };
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].artifact.path, /^\.codex\/trigger\/tonton-/);
  assert.equal(result.ok, true);
  assert.equal(result.dispatchResult.ref, 'dry-run');
});

test('GITHUB-TRIGGER-04 rejected dispatcher is surfaced', async () => {
  await assert.rejects(
    () => dispatchTontonGithubTrigger(
      { id: 'sig-3', source: 'test' },
      { dispatchTrigger: async () => ({ accepted: false }) },
    ),
    (err) => err instanceof TontonGithubTriggerError && err.code === 'TONTON_TRIGGER_REJECTED',
  );
});
