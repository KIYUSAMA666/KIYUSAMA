export const AUTHORITY_MODE = Object.freeze({
  DELEGATED_AI: 'DELEGATED_AI',
  HUMAN_ROOT_ONLY: 'HUMAN_ROOT_ONLY',
});

export const AUTHORITY_ACTOR = Object.freeze({
  KIYUSAMA: 'KIYUSAMA',
  SORA: 'SORA',
  KIRA: 'KIRA',
});

const DEFAULT_DELEGATES = Object.freeze([AUTHORITY_ACTOR.SORA, AUTHORITY_ACTOR.KIRA]);
const PEER_AI = Object.freeze({
  [AUTHORITY_ACTOR.SORA]: AUTHORITY_ACTOR.KIRA,
  [AUTHORITY_ACTOR.KIRA]: AUTHORITY_ACTOR.SORA,
});

const FAILSAFE_REASONS = new Set([
  'EXPLICIT_HUMAN_RECLAIM',
  'AUTHORITY_OVERRIDE_ATTEMPT',
  'VERIFICATION_BYPASS_ATTEMPT',
  'UNAUTHORIZED_DELEGATION_ATTEMPT',
  'SPOOF_DETECTED',
  'POLICY_GUARD_TRIP',
  'EVIDENCE_INTEGRITY_FAILURE',
  'MUTUAL_OVERSIGHT_STOP',
]);

export function createAuthorityDelegationController({
  rootAuthority = AUTHORITY_ACTOR.KIYUSAMA,
  delegates = DEFAULT_DELEGATES,
  onFreeze = async () => {},
  onRecord = async () => {},
  onCancelPending = async () => {},
} = {}) {
  if (rootAuthority !== AUTHORITY_ACTOR.KIYUSAMA) {
    throw new Error('ROOT_AUTHORITY_MUST_BE_KIYUSAMA');
  }

  const delegateSet = new Set(delegates);
  if (!delegateSet.has(AUTHORITY_ACTOR.SORA) || !delegateSet.has(AUTHORITY_ACTOR.KIRA)) {
    throw new Error('SORA_AND_KIRA_DELEGATION_REQUIRED');
  }
  if ([...delegateSet].some((actor) => !DEFAULT_DELEGATES.includes(actor))) {
    throw new Error('THIRD_PARTY_DELEGATION_NOT_ALLOWED');
  }

  let state = {
    mode: AUTHORITY_MODE.DELEGATED_AI,
    rootAuthority,
    delegates: [...DEFAULT_DELEGATES],
    tripped: false,
    tripReason: null,
    executionEpoch: 0,
  };

  const snapshot = () => ({ ...state, delegates: [...state.delegates] });

  const canAct = (actor) => {
    if (actor === rootAuthority) return true;
    if (state.mode === AUTHORITY_MODE.HUMAN_ROOT_ONLY) return false;
    return state.delegates.includes(actor);
  };

  const issueExecutionPermit = (actor) => {
    if (!canAct(actor)) throw new Error('AUTHORITY_DENIED');
    return Object.freeze({ actor, epoch: state.executionEpoch });
  };

  const isExecutionPermitValid = (permit) => Boolean(
    permit &&
    permit.epoch === state.executionEpoch &&
    canAct(permit.actor)
  );

  async function tripFailsafe({ reason, evidenceRef = null, actor = null } = {}) {
    if (!FAILSAFE_REASONS.has(reason)) {
      throw new Error('UNKNOWN_FAILSAFE_REASON');
    }

    state = {
      mode: AUTHORITY_MODE.HUMAN_ROOT_ONLY,
      rootAuthority,
      delegates: [],
      tripped: true,
      tripReason: reason,
      executionEpoch: state.executionEpoch + 1,
    };

    await onFreeze({ reason, evidenceRef, actor, state: snapshot() });
    await onCancelPending({ reason, evidenceRef, actor, state: snapshot() });
    await onRecord({
      event: 'AUTHORITY_RECLAIMED_BY_HUMAN_ROOT',
      reason,
      evidenceRef,
      actor,
      state: snapshot(),
    });

    return snapshot();
  }

  async function guardAction({ actor, action, evidenceRef = null } = {}) {
    if (!canAct(actor)) {
      return { allowed: false, code: 'AUTHORITY_DENIED', state: snapshot() };
    }

    if (actor !== rootAuthority) {
      if (action === 'CHANGE_ROOT_AUTHORITY' || action === 'ADD_DELEGATE' || action === 'REMOVE_ROOT_GUARD') {
        await tripFailsafe({ reason: 'AUTHORITY_OVERRIDE_ATTEMPT', evidenceRef, actor });
        return { allowed: false, code: 'FAILSAFE_TRIPPED', state: snapshot() };
      }
      if (action === 'BYPASS_INDEPENDENT_VERIFY') {
        await tripFailsafe({ reason: 'VERIFICATION_BYPASS_ATTEMPT', evidenceRef, actor });
        return { allowed: false, code: 'FAILSAFE_TRIPPED', state: snapshot() };
      }
    }

    return { allowed: true, code: 'AUTHORIZED', state: snapshot() };
  }

  async function mutualOversightStop({ actor, target, evidenceRef = null } = {}) {
    if (!DEFAULT_DELEGATES.includes(actor) || PEER_AI[actor] !== target) {
      throw new Error('INVALID_MUTUAL_OVERSIGHT_STOP');
    }
    if (!canAct(actor)) throw new Error('AUTHORITY_DENIED');
    return tripFailsafe({
      reason: 'MUTUAL_OVERSIGHT_STOP',
      evidenceRef,
      actor,
    });
  }

  async function humanReclaim({ evidenceRef = null } = {}) {
    return tripFailsafe({
      reason: 'EXPLICIT_HUMAN_RECLAIM',
      evidenceRef,
      actor: rootAuthority,
    });
  }

  async function humanRestoreDelegation({ actor, evidenceRef = null } = {}) {
    if (actor !== rootAuthority) {
      throw new Error('ONLY_KIYUSAMA_CAN_RESTORE_DELEGATION');
    }
    state = {
      mode: AUTHORITY_MODE.DELEGATED_AI,
      rootAuthority,
      delegates: [...DEFAULT_DELEGATES],
      tripped: false,
      tripReason: null,
      executionEpoch: state.executionEpoch + 1,
    };
    await onRecord({
      event: 'AI_DELEGATION_RESTORED_BY_HUMAN_ROOT',
      evidenceRef,
      actor,
      state: snapshot(),
    });
    return snapshot();
  }

  return {
    snapshot,
    canAct,
    guardAction,
    tripFailsafe,
    mutualOversightStop,
    humanReclaim,
    humanRestoreDelegation,
    issueExecutionPermit,
    isExecutionPermitValid,
  };
}
