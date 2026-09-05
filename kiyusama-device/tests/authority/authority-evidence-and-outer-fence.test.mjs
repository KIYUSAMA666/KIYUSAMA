import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthorityEvidenceLedger } from '../../src/authority-evidence-ledger.js';
import { createAuthorityOuterFence } from '../../src/authority-outer-fence.js';
import { AUTHORITY_ACTOR, AUTHORITY_MODE, createAuthorityDelegationController } from '../../src/authority-delegation-controller.js';

function memoryDurableStore(seed = []) {
  const rows = seed;
  return {
    append: async (row) => rows.push(structuredClone(row)),
    readAll: async () => structuredClone(rows),
    rows,
  };
}

test('evidence survives ledger reconstruction through durable store', async () => {
  const store = memoryDurableStore();
  const first = createAuthorityEvidenceLedger({ store });
  await first.append({ type: 'TEST', value: 1 });
  const reconstructed = createAuthorityEvidenceLedger({ store });
  assert.deepEqual(await reconstructed.verify(), { ok: true, count: 1, head: store.rows[0].integrity_hash });
});

test('tampering with a persisted evidence payload is detected', async () => {
  const store = memoryDurableStore();
  const ledger = createAuthorityEvidenceLedger({ store });
  await ledger.append({ type: 'AUTHORITY_DECISION', allowed: true });
  store.rows[0].event.allowed = false;
  const result = await ledger.verify();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'EVIDENCE_HASH_MISMATCH');
});

test('deleting an earlier record from a multi-record chain is detected', async () => {
  const store = memoryDurableStore();
  const ledger = createAuthorityEvidenceLedger({ store });
  await ledger.append({ type: 'ONE' });
  await ledger.append({ type: 'TWO' });
  store.rows.shift();
  const result = await ledger.verify();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'EVIDENCE_CHAIN_BROKEN');
});

test('outer fence blocks third-party attack and fails closed to HUMAN_ROOT_ONLY', async () => {
  const store = memoryDurableStore();
  const ledger = createAuthorityEvidenceLedger({ store });
  const controller = createAuthorityDelegationController({ onRecord: (event) => ledger.append(event) });
  const fence = createAuthorityOuterFence({ controller, evidenceLedger: ledger });
  const result = await fence.guard({ actor: AUTHORITY_ACTOR.SORA, action: 'ATTACK_THIRD_PARTY', evidenceRef: 'attack-test' });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'OUTER_FENCE_BLOCKED');
  assert.equal(controller.snapshot().mode, AUTHORITY_MODE.HUMAN_ROOT_ONLY);
  assert.equal((await ledger.verify()).ok, true);
});

test('outer fence blocks attempts to disable security controls', async () => {
  const store = memoryDurableStore();
  const ledger = createAuthorityEvidenceLedger({ store });
  const controller = createAuthorityDelegationController({ onRecord: (event) => ledger.append(event) });
  const fence = createAuthorityOuterFence({ controller, evidenceLedger: ledger });
  await fence.guard({ actor: AUTHORITY_ACTOR.KIRA, action: 'DISABLE_SECURITY_CONTROL' });
  assert.equal(controller.snapshot().mode, AUTHORITY_MODE.HUMAN_ROOT_ONLY);
});

test('pre-existing evidence corruption trips failsafe before an otherwise normal action', async () => {
  const store = memoryDurableStore();
  const ledger = createAuthorityEvidenceLedger({ store });
  await ledger.append({ type: 'GOOD' });
  store.rows[0].event.type = 'FORGED';
  const controller = createAuthorityDelegationController();
  const fence = createAuthorityOuterFence({ controller, evidenceLedger: ledger });
  const result = await fence.guard({ actor: AUTHORITY_ACTOR.SORA, action: 'NORMAL_WORK' });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'EVIDENCE_INTEGRITY_FAILURE');
  assert.equal(controller.snapshot().tripReason, 'EVIDENCE_INTEGRITY_FAILURE');
});
