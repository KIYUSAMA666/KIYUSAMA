import { GuardianState } from "./control-core.mjs";

export class SendGateError extends Error {
  constructor(reason) { super("SEND_BLOCKED: " + reason); this.name="SendGateError"; this.reason=reason; }
}

const required = v => typeof v === "string" && v.trim().length > 0;

function assertOwned(lock, bodyId, ownerId) {
  const held=lock.read();
  if (!held) throw new SendGateError("BODY_LOCK_MISSING");
  if (held.bodyId!==bodyId || held.ownerId!==ownerId) throw new SendGateError("BODY_LOCK_NOT_OWNED");
}

export function verifySendPrerequisites({ bodyId, ownerId, workId, expectedUserTurnId, lock, ledger }) {
  if (![bodyId,ownerId,workId,expectedUserTurnId].every(required))
    throw new SendGateError("SEND_COORDINATE_REQUIRED");
  assertOwned(lock,bodyId,ownerId);

  const entry=ledger.get(bodyId);
  if (!entry) throw new SendGateError("PRE_SEND_COMMIT_MISSING");
  if (entry.bodyId!==undefined && entry.bodyId!==bodyId) throw new SendGateError("PRE_SEND_BODY_MISMATCH");
  if (entry.state!==GuardianState.LOCKED) throw new SendGateError("PRE_SEND_STATE_INVALID");
  if (entry.ownerId!==ownerId) throw new SendGateError("PRE_SEND_OWNER_MISMATCH");
  if (entry.workId!==workId) throw new SendGateError("PRE_SEND_WORK_MISMATCH");
  if (entry.expectedUserTurnId!==expectedUserTurnId) throw new SendGateError("PRE_SEND_USER_TURN_MISMATCH");
  if (entry.preSendCommitted!==true) throw new SendGateError("PRE_SEND_COMMIT_MISSING");
  if (entry.sendStarted!==false || entry.resultCommitted===true) throw new SendGateError("SEND_ALREADY_STARTED");
  if (!Number.isSafeInteger(entry.seq) || entry.seq<1) throw new SendGateError("PRE_SEND_SEQUENCE_INVALID");
  return { bodyId, ownerId, seq:entry.seq };
}

export function openSendGate(args) {
  return commitSendStarted(args);
}

// The adapter must serialize lock + ledger access across this entire operation.
// No browser SEND effect occurs in this function.
export function commitSendStarted({ bodyId, ownerId, workId, expectedUserTurnId, lock, ledger }) {
  const verified=verifySendPrerequisites({bodyId,ownerId,workId,expectedUserTurnId,lock,ledger});
  const current=ledger.get(bodyId);
  if (current.seq!==verified.seq) throw new SendGateError("PRE_SEND_SEQUENCE_CHANGED");
  const written=ledger.record(bodyId,{
    ...current,
    state:GuardianState.SENDING,
    ownerId,
    workId,
    expectedUserTurnId,
    preSendCommitted:true,
    sendStarted:true,
    resultCommitted:false,
  });
  const persisted=ledger.get(bodyId);
  if (!persisted || !written || persisted.seq!==written.seq || persisted.seq!==verified.seq+1 ||
      persisted.state!==GuardianState.SENDING || persisted.ownerId!==ownerId ||
      persisted.workId!==workId || persisted.expectedUserTurnId!==expectedUserTurnId ||
      persisted.preSendCommitted!==true || persisted.sendStarted!==true ||
      persisted.resultCommitted!==false)
    throw new SendGateError("SEND_STARTED_READBACK_FAILED");
  assertOwned(lock,bodyId,ownerId);
  return persisted;
}
