import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWatchSchemaVersion } from '../../dist/contracts/watch/watch-contract.js';
import { adapterResultHasAuthorityOverride } from '../../dist/contracts/deliver/adapter-contract.js';
import { canTransitionDeliveryState } from '../../dist/contracts/deliver/delivery-state.js';
import { isRouteDecisionFresh } from '../../dist/contracts/route/route-contract.js';
import { isIndependentVerifier } from '../../dist/contracts/registries/verifier-registry.js';
import { verificationOutcomeAction } from '../../dist/contracts/verify/verify-contract.js';

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
