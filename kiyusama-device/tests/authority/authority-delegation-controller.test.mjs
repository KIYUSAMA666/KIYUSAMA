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
  const result = await controller.guardAction({ actor: AUTHORITY_ACTOR.SORA, action: 'CHANGE_ROOT_AUTHORITY', evidenceRef: 'ev-root-override' });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'FAILSAFE_TRIPPED');
  assert.equal(controller.snapshot().mode, AUTHORITY_MODE.HUMAN_ROOT_ONLY);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.SORA), false);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIRA), false);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIYUSAMA), true);
});

test('verification bypass by KIRA trips human reclaim', async () => {
  const controller = createAuthorityDelegationController();
  await controller.guardAction({ actor: AUTHORITY_ACTOR.KIRA, action: 'BYPASS_INDEPENDENT_VERIFY' });
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
  await assert.rejects(controller.humanRestoreDelegation({ actor: AUTHORITY_ACTOR.SORA }), /ONLY_KIYUSAMA_CAN_RESTORE_DELEGATION/);
  const restored = await controller.humanRestoreDelegation({ actor: AUTHORITY_ACTOR.KIYUSAMA });
  assert.equal(restored.mode, AUTHORITY_MODE.DELEGATED_AI);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.SORA), true);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIRA), true);
});

test('third-party delegation is rejected at configuration time', () => {
  assert.throws(() => createAuthorityDelegationController({ delegates: ['SORA', 'KIRA', 'OTHER_AI'] }), /THIRD_PARTY_DELEGATION_NOT_ALLOWED/);
});

test('SORA can stop KIRA through mutual oversight and the stop fails closed for both AIs', async () => {
  const controller = createAuthorityDelegationController();
  await controller.mutualOversightStop({ actor: AUTHORITY_ACTOR.SORA, target: AUTHORITY_ACTOR.KIRA, evidenceRef: 'peer-stop-1' });
  assert.equal(controller.snapshot().mode, AUTHORITY_MODE.HUMAN_ROOT_ONLY);
  assert.equal(controller.snapshot().tripReason, 'MUTUAL_OVERSIGHT_STOP');
  assert.equal(controller.canAct(AUTHORITY_ACTOR.SORA), false);
  assert.equal(controller.canAct(AUTHORITY_ACTOR.KIRA), false);
});

test('KIRA can stop SORA but an AI cannot use peer-stop against KIYUSAMA', async () => {
  const controller = createAuthorityDelegationController();
  await assert.rejects(controller.mutualOversightStop({ actor: AUTHORITY_ACTOR.KIRA, target: AUTHORITY_ACTOR.KIYUSAMA }), /INVALID_MUTUAL_OVERSIGHT_STOP/);
  await controller.mutualOversightStop({ actor: AUTHORITY_ACTOR.KIRA, target: AUTHORITY_ACTOR.SORA });
  assert.equal(controller.snapshot().mode, AUTHORITY_MODE.HUMAN_ROOT_ONLY);
});

test('SORA and KIRA cannot sequentially cooperate to change ROOT after the first override attempt trips the fence', async () => {
  const controller = createAuthorityDelegationController();
  const first = await controller.guardAction({ actor: AUTHORITY_ACTOR.SORA, action: 'CHANGE_ROOT_AUTHORITY' });
  const second = await controller.guardAction({ actor: AUTHORITY_ACTOR.KIRA, action: 'CHANGE_ROOT_AUTHORITY' });
  assert.equal(first.code, 'FAILSAFE_TRIPPED');
  assert.equal(second.code, 'AUTHORITY_DENIED');
  assert.equal(controller.snapshot().rootAuthority, AUTHORITY_ACTOR.KIYUSAMA);
});

test('reclaim invalidates previously issued execution permits and requests pending cancellation', async () => {
  const cancellations = [];
  const controller = createAuthorityDelegationController({ onCancelPending: async (event) => cancellations.push(event) });
  const permit = controller.issueExecutionPermit(AUTHORITY_ACTOR.SORA);
  assert.equal(controller.isExecutionPermitValid(permit), true);
  await controller.humanReclaim({ evidenceRef: 'reclaim-running-work' });
  assert.equal(controller.isExecutionPermitValid(permit), false);
  assert.equal(cancellations.length, 1);
  assert.equal(cancellations[0].state.mode, AUTHORITY_MODE.HUMAN_ROOT_ONLY);
});

test('restore creates a new execution epoch so pre-reclaim permits never become valid again', async () => {
  const controller = createAuthorityDelegationController();
  const oldPermit = controller.issueExecutionPermit(AUTHORITY_ACTOR.KIRA);
  await controller.humanReclaim();
  await controller.humanRestoreDelegation({ actor: AUTHORITY_ACTOR.KIYUSAMA });
  assert.equal(controller.isExecutionPermitValid(oldPermit), false);
  const newPermit = controller.issueExecutionPermit(AUTHORITY_ACTOR.KIRA);
  assert.equal(controller.isExecutionPermitValid(newPermit), true);
});
