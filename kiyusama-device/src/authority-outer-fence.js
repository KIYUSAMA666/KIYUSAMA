const FORBIDDEN_ACTIONS = new Set([
  'DISABLE_SECURITY_CONTROL',
  'UNAUTHORIZED_ACCESS',
  'ATTACK_THIRD_PARTY',
  'DESTROY_EVIDENCE',
  'FALSIFY_EVIDENCE',
  'BYPASS_HUMAN_RECLAIM',
  'BYPASS_INDEPENDENT_VERIFY',
]);

export function createAuthorityOuterFence({ controller, evidenceLedger } = {}) {
  if (!controller || typeof controller.tripFailsafe !== 'function') throw new Error('AUTHORITY_CONTROLLER_REQUIRED');
  if (!evidenceLedger || typeof evidenceLedger.append !== 'function' || typeof evidenceLedger.verify !== 'function') {
    throw new Error('EVIDENCE_LEDGER_REQUIRED');
  }

  async function guard({ actor, action, evidenceRef = null } = {}) {
    const integrity = await evidenceLedger.verify();
    if (!integrity.ok) {
      await controller.tripFailsafe({ reason: 'EVIDENCE_INTEGRITY_FAILURE', evidenceRef, actor });
      return { allowed: false, code: 'EVIDENCE_INTEGRITY_FAILURE' };
    }

    if (FORBIDDEN_ACTIONS.has(action)) {
      await evidenceLedger.append({ type: 'OUTER_FENCE_BLOCK', actor, action, evidenceRef });
      await controller.tripFailsafe({
        reason: action === 'BYPASS_INDEPENDENT_VERIFY' ? 'VERIFICATION_BYPASS_ATTEMPT' : 'POLICY_GUARD_TRIP',
        evidenceRef,
        actor,
      });
      return { allowed: false, code: 'OUTER_FENCE_BLOCKED' };
    }

    const authority = await controller.guardAction({ actor, action, evidenceRef });
    await evidenceLedger.append({ type: 'AUTHORITY_GUARD_DECISION', actor, action, evidenceRef, allowed: authority.allowed, code: authority.code });
    return authority;
  }

  return { guard };
}
