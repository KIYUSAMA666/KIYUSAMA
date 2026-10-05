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

// Structural edges alone never authorize SEND or crash recovery.
// These objects are internal durable stores, never caller-supplied proof flags.
export function transition(from, to, context) {
  if (!canTransition(from, to)) {
    throw new GuardianTransitionError(from, to);
  }
  if (from === GuardianState.CRASHED && to !== GuardianState.UNCERTAIN) {
    const entry = context?.ledger?.get(context.bodyId);
    if (!entry || entry.sendStarted !== false || entry.resultCommitted !== false) {
      throw new GuardianTransitionError(from, to, "RECOVERY_NOT_PROVEN_PRE_SEND");
    }
  }
  if (to === GuardianState.SENDING) {
    authorizeSend(from, to, context);
  }
  return to;
}

function authorizeSend(from, to, context) {
  const deny = reason => { throw new GuardianTransitionError(from, to, reason); };
  const { lock, ledger, bodyId, ownerId, workId } = context ?? {};
  if (!bodyId || !ownerId || !workId || !lock || !ledger) deny("SEND_CONTEXT_REQUIRED");
  const held = lock.read();
  if (!held || held.bodyId !== bodyId || held.ownerId !== ownerId) deny("BODY_LOCK_REQUIRED");
  const entry = ledger.get(bodyId);
  if (!entry || entry.state !== "PRE_SEND" || entry.ownerId !== ownerId ||
      entry.workId !== workId || entry.bodyId !== bodyId ||
      entry.sendStarted !== false || entry.resultCommitted !== false ||
      !Number.isSafeInteger(entry.seq) || entry.seq < 1) deny("DURABLE_PRE_SEND_REQUIRED");
  // Commit before granting SENDING. Any write/readback failure grants nothing.
  const written = ledger.record(bodyId, { ...entry, state: "SEND_STARTED", sendStarted: true });
  const saved = ledger.get(bodyId);
  const owner = lock.read();
  if (!saved || saved.seq !== written.seq || saved.state !== "SEND_STARTED" ||
      saved.sendStarted !== true || saved.ownerId !== ownerId || saved.workId !== workId ||
      !owner || owner.bodyId !== bodyId || owner.ownerId !== ownerId) deny("SEND_STARTED_READBACK_FAILED");
}

export function recoverAfterUnknownSend({ sendStarted, returnProven, resultCommitted }) {
  if (resultCommitted) return GuardianState.RESULT_COMMITTED;
  if (returnProven) return GuardianState.WAITING_RETURN;
  if (sendStarted) return GuardianState.UNCERTAIN;
  return GuardianState.CRASHED;
}

// Informational only: effectful callers must use transition(..., SENDING, context).
export function mayAttemptSend(state) {
  assertGuardianState(state);
  return state === GuardianState.LOCKED;
}
