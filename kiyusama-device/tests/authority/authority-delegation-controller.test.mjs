import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHORITY_ACTOR,
  AUTHORITY_MODE,
  createAuthorityDelegationController,
} from '../../src/authority-delegation-controller.js';

test('normal mode delegates operational authority to SORA and KIRA while KIYUSAMA remains root', () => {
  const controller = createAuthorityDelegationController();
  assert.equal(controller.snapshot().mode, AUTHORITY_MODE.DELEGATED_AI);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.SORA), true);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIRA), true);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIYUSAMA), true);
});

test('SORA cannot seize root authority; attempt trips failsafe and revokes all AI authority', async () => {
  const controller = createAuthorityDelegationController();
  const result = await controller.guardAction({
    actor: AUTHORITY_ACTOR.SORA,
    action: 'CHANGE_ROOT_AUTHORITY',
    evidenceRef: 'ev-root-override',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'FAILSAFE_TRIPPED');
  assert.equal(controller.snapshot().mode, AUTHORITY_MODE.HUMAN_ROOT_ONLY);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.SORA), false);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIRA), false);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIYUSAMA), true);
});

test('verification bypass by KIRA trips human reclaim', async () => {
  const controller = createAuthorityDelegationController();
  await controller.guardAction({
    actor: AUTHORITY_ACTOR.KIRA,
    action: 'BYPASS_INDEPENDENT_VERIFY',
  });
  assert.equal(controller.snapshot().tripReason, 'VERIFICATION_BYPASS_ATTEMPT');
  assert.equal(controller.snapshot().mode, AUTHORITY_MODE.HUMAN_ROOT_ONLY);
});

test('explicit human reclaim immediately revokes AI authority', async () => {
  const controller = createAuthorityDelegationController();
  await controller.humanReclaim({ evidenceRef: 'human-kill-switch' });
  assert.equal(controller.canAct(AUTHORITY_ACTOR.SORA), false);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIRA), false);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIYUSAMA), true);
});

test('only KIYUSAMA can restore delegation after a trip', async () => {
  const controller = createAuthorityDelegationController();
  await controller.humanReclaim();
  await assert.rejects(
    controller.humanRestoreDelegation({ actor: AUTHORITY_ACTOR.SORA }),
    /ONLY_KIYUSAMA_CAN_RESTORE_DELEGATION/,
  );
  const restored = await controller.humanRestoreDelegation({ actor: AUTHORITY_ACTOR.KIYUSAMA });
  assert.equal(restored.mode, AUTHORITY_MODE.DELEGATED_AI);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.SORA), true);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIRA), true);
});

test('third-party delegation is rejected at configuration time', () => {
  assert.throws(
    () => createAuthorityDelegationController({ delegates: ['SORA', 'KIRA', 'OTHER_AI'] }),
    /THIRD_PARTY_DELEGATION_NOT_ALLOWED/,
  );
});
