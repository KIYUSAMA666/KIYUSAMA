export const GuardianState = Object.freeze({
  READY: "READY",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  DOM_DRIFT: "DOM_DRIFT",
  LOCKED: "LOCKED",
  SENDING: "SENDING",
  WAITING_RETURN: "WAITING_RETURN",
  UNCERTAIN: "UNCERTAIN",
  STALLED: "STALLED",
  CRASHED: "CRASHED",
  RESULT_COMMITTED: "RESULT_COMMITTED",
});

const ALLOWED = Object.freeze({
  READY: new Set(["LOCKED", "AUTH_REQUIRED", "DOM_DRIFT"]),
  AUTH_REQUIRED: new Set(["READY"]),
  DOM_DRIFT: new Set(["READY"]),
  LOCKED: new Set(["SENDING", "AUTH_REQUIRED", "DOM_DRIFT", "CRASHED"]),
  SENDING: new Set(["WAITING_RETURN", "UNCERTAIN", "CRASHED"]),
  WAITING_RETURN: new Set(["RESULT_COMMITTED", "STALLED", "UNCERTAIN", "CRASHED"]),
  STALLED: new Set(["WAITING_RETURN", "UNCERTAIN", "CRASHED"]),
  CRASHED: new Set(["READY", "AUTH_REQUIRED", "DOM_DRIFT", "UNCERTAIN"]),
  RESULT_COMMITTED: new Set(["READY"]),
  UNCERTAIN: new Set([]),
});

export class GuardianTransitionError extends Error {
  constructor(from, to, reason = "TRANSITION_DENIED") {
    super(`${reason}: ${from} -> ${to}`);
    this.name = "GuardianTransitionError";
    this.from = from;
    this.to = to;
    this.reason = reason;
  }
}

export function assertGuardianState(state) {
  if (!Object.hasOwn(GuardianState, state)) {
    throw new GuardianTransitionError(state, state, "UNKNOWN_STATE");
  }
  return state;
}

export function canTransition(from, to) {
  assertGuardianState(from);
  assertGuardianState(to);
  return ALLOWED[from].has(to);
}

export function transition(from, to) {
  if (!canTransition(from, to)) {
    throw new GuardianTransitionError(from, to);
  }
  return to;
}

export function recoverAfterUnknownSend({ sendStarted, returnProven, resultCommitted }) {
  if (resultCommitted) return GuardianState.RESULT_COMMITTED;
  if (returnProven) return GuardianState.WAITING_RETURN;
  if (sendStarted) return GuardianState.UNCERTAIN;
  return GuardianState.CRASHED;
}

export function mayAttemptSend(state) {
  assertGuardianState(state);
  return state === GuardianState.LOCKED;
}
