import { commitReturnResult } from "./return-gate.mjs";

const RETURN_TOKEN = Symbol("GUARDIAN_RETURN_TOKEN");

export class ReturnCapabilityError extends Error {
  constructor(reason){ super("RETURN_CAPABILITY_BLOCKED: "+reason); this.name="ReturnCapabilityError"; this.reason=reason; }
}

function pendingPayload(entry) {
  return {
    proof:{
      bodyId:entry.bodyId, ownerId:entry.ownerId, workId:entry.workId,
      expectedUserTurnId:entry.expectedUserTurnId, assistantTurnId:entry.assistantTurnId,
    },
    saved:entry,
  };
}

async function completePending({ledger,bodyId,effectfulResultCommit,payload}) {
  const current=ledger.get(bodyId);
  if (!current || current.state!=="RESULT_COMMITTED" || current.resultCommitted!==true ||
      current.externalResultPending!==true)
    throw new ReturnCapabilityError("NO_PENDING_EXTERNAL_RESULT");
  if (current.ownerId!==payload.saved.ownerId || current.workId!==payload.saved.workId ||
      current.expectedUserTurnId!==payload.saved.expectedUserTurnId ||
      current.assistantTurnId!==payload.saved.assistantTurnId)
    throw new ReturnCapabilityError("PENDING_RESULT_COORDINATE_MISMATCH");
  if (current.externalResultAttempted===true) throw new ReturnCapabilityError("EXTERNAL_RESULT_AMBIGUOUS_HOLD");
  // Durable attempt marker BEFORE effect. If a crash occurs after this point,
  // never replay blindly; reconciliation with the external receiver is required.
  const attempted=ledger.record(bodyId,{...current,externalResultAttempted:true},{expectedSeq:current.seq});
  const attemptReadback=ledger.get(bodyId);
  if (!attemptReadback || attemptReadback.seq!==attempted.seq || attemptReadback.externalResultAttempted!==true)
    throw new ReturnCapabilityError("RESULT_ATTEMPT_READBACK_FAILED");
  const result=await effectfulResultCommit(RETURN_TOKEN,payload);
  const latest=ledger.get(bodyId);
  if (!latest || latest.seq!==attempted.seq || latest.externalResultPending!==true)
    throw new ReturnCapabilityError("PENDING_RESULT_CHANGED");
  ledger.record(bodyId,{...latest,externalResultPending:false,externalResultCompleted:true},{expectedSeq:latest.seq});
  return result;
}

export function createGuardianReturnCapability({ ledger, effectfulResultCommit }) {
  if (typeof effectfulResultCommit!=="function") throw new TypeError("effectfulResultCommit required");
  return Object.freeze({
    commit: async proof => {
      const saved=commitReturnResult({...proof,ledger});
      return completePending({ledger,bodyId:proof.bodyId,effectfulResultCommit,payload:{proof,saved}});
    },
    resumePending: async bodyId => {
      const entry=ledger.get(bodyId);
      if (!entry || entry.externalResultPending!==true) throw new ReturnCapabilityError("NO_PENDING_EXTERNAL_RESULT");
      return completePending({ledger,bodyId,effectfulResultCommit,payload:pendingPayload(entry)});
    }
  });
}

export function createEffectfulResultCommitPort(rawCommit) {
  if (typeof rawCommit!=="function") throw new TypeError("rawCommit required");
  return async function guardianOnlyResultCommit(token,payload) {
    if (token!==RETURN_TOKEN) throw new ReturnCapabilityError("INVALID_RETURN_CAPABILITY");
    return rawCommit(payload);
  };
}
