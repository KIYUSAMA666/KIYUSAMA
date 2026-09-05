import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateWatchSchemaVersion } from '../../dist/contracts/watch/watch-contract.js';
import { adapterResultHasAuthorityOverride } from '../../dist/contracts/deliver/adapter-contract.js';
import { canTransitionDeliveryState } from '../../dist/contracts/deliver/delivery-state.js';
import { isRouteDecisionFresh } from '../../dist/contracts/route/route-contract.js';
import { isIndependentVerifier } from '../../dist/contracts/registries/verifier-registry.js';
import { verificationOutcomeAction } from '../../dist/contracts/verify/verify-contract.js';

const transitionContext = { independent_verification_evidence: true };

test('UNKNOWN schema_version is rejected', () => {
  assert.equal(validateWatchSchemaVersion({ schema_version: 'unknown' }), 'UNKNOWN_SCHEMA_VERSION');
});

test('adapter cannot self-elevate authority', () => {
  assert.equal(adapterResultHasAuthorityOverride({ authority: 'R3' }), true);
});

test('expired RouteDecision is rejected as stale', () => {
  assert.equal(isRouteDecisionFresh({ expires_at: '2020-01-01T00:00:00Z' }, Date.now()), false);
});

test('ACKNOWLEDGED cannot jump to VERIFIED without independent evidence', () => {
  assert.equal(canTransitionDeliveryState('ACKNOWLEDGED', 'VERIFIED', { independent_verification_evidence: false }), false);
});

test('executing adapter cannot be its own verifier', () => {
  const verifier = { verifier_id: 'v1', subject_id: 'codex', version: '1', integrity_hash: 'h', disallowed_adapter_ids: ['codex'], enabled: true };
  assert.equal(isIndependentVerifier(verifier, 'codex'), false);
});

test('VERIFY_INCONCLUSIVE escalates', () => {
  assert.equal(verificationOutcomeAction('VERIFY_INCONCLUSIVE'), 'ESCALATE_KIRA_KIYUSAMA');
});

test('DeliveryEnvelope declaration includes ttl replay field', async () => {
  const declaration = await readFile(new URL('../../dist/contracts/deliver/delivery-envelope.d.ts', import.meta.url), 'utf8');
  assert.match(declaration, /readonly ttl: number;/);
});

test('normal delivery path ROUTED through RECORDED is fully allowed', () => {
  const path = [
    ['ROUTED', 'DEDUPE_CHECKED'],
    ['DEDUPE_CHECKED', 'AUTHORIZED'],
    ['AUTHORIZED', 'DELIVERY_ATTEMPTED'],
    ['DELIVERY_ATTEMPTED', 'ACKNOWLEDGED'],
    ['ACKNOWLEDGED', 'VERIFIED'],
    ['VERIFIED', 'RECORDED'],
  ];
  for (const [from, to] of path) {
    assert.equal(canTransitionDeliveryState(from, to, transitionContext), true, `${from} -> ${to}`);
  }
});

test('ROUTED cannot skip directly to RECORDED', () => {
  assert.equal(canTransitionDeliveryState('ROUTED', 'RECORDED', transitionContext), false);
});

test('terminal delivery states cannot transition again', () => {
  const terminalStates = ['RECORDED', 'DUPLICATE', 'EXPIRED', 'SPOOF_DETECTED', 'AUTHORITY_DENIED', 'DELIVERY_FAILED', 'VERIFY_FAILED', 'TIMEOUT', 'FROZEN'];
  for (const state of terminalStates) {
    assert.equal(canTransitionDeliveryState(state, 'ROUTED', transitionContext), false, `${state} -> ROUTED`);
  }
});

test('VerificationStatus declaration includes VERIFY_TIMEOUT', async () => {
  const declaration = await readFile(new URL('../../dist/contracts/verify/verify-contract.d.ts', import.meta.url), 'utf8');
  assert.match(declaration, /'VERIFY_TIMEOUT'/);
});

test('VerificationStatus declaration includes VERIFY_EXPIRED', async () => {
  const declaration = await readFile(new URL('../../dist/contracts/verify/verify-contract.d.ts', import.meta.url), 'utf8');
  assert.match(declaration, /'VERIFY_EXPIRED'/);
});

test('VerificationStatus declaration includes FROZEN', async () => {
  const declaration = await readFile(new URL('../../dist/contracts/verify/verify-contract.d.ts', import.meta.url), 'utf8');
  assert.match(declaration, /'FROZEN'/);
});
