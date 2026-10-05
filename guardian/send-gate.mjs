import { GuardianState, transition } from "./control-core.mjs";

export class SendGateError extends Error {
  constructor(reason) { super("SEND_BLOCKED: " + reason); this.name="SendGateError"; this.reason=reason; }
}

export function verifySendPrerequisites({ bodyId, ownerId, lock, ledger }) {
  const held=lock.read();
  if (!held) throw new SendGateError("BODY_LOCK_MISSING");
  if (held.bodyId!==bodyId || held.ownerId!==ownerId) throw new SendGateError("BODY_LOCK_NOT_OWNED");

  const entry=ledger.get(bodyId);
  if (!entry) throw new SendGateError("PRE_SEND_COMMIT_MISSING");
  if (entry.state!==GuardianState.LOCKED) throw new SendGateError("PRE_SEND_STATE_INVALID");
  if (entry.ownerId!==ownerId) throw new SendGateError("PRE_SEND_OWNER_MISMATCH");
  if (!entry.workId) throw new SendGateError("PRE_SEND_WORK_MISSING");
  if (entry.preSendCommitted!==true) throw new SendGateError("PRE_SEND_COMMIT_MISSING");
  if (entry.sendStarted===true) throw new SendGateError("SEND_ALREADY_STARTED");
  return { bodyId, ownerId, seq:entry.seq };
}

export function openSendGate(args) {
  const proof=verifySendPrerequisites(args);
  return { ...proof, state:transition(GuardianState.LOCKED, GuardianState.SENDING) };
}

export function commitSendStarted({ bodyId, ownerId, lock, ledger }) {
  verifySendPrerequisites({bodyId,ownerId,lock,ledger});
  const current=ledger.get(bodyId);
  return ledger.record(bodyId,{
    ...current,
    state:GuardianState.SENDING,
    ownerId,
    workId:current.workId,
    preSendCommitted:true,
    sendStarted:true,
    resultCommitted:false,
  });
}
