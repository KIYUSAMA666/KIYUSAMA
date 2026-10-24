import { commitSendStarted } from "./send-gate.mjs";

const SEND_TOKEN = Symbol("GUARDIAN_SEND_TOKEN");

export class GuardianCapabilityError extends Error {
  constructor(reason){ super("SEND_CAPABILITY_BLOCKED: "+reason); this.name="GuardianCapabilityError"; this.reason=reason; }
}

export function createGuardianSendCapability({ bodyId, ownerId, workId, expectedUserTurnId, lock, ledger, effectfulSend }) {
  if (typeof effectfulSend !== "function") throw new TypeError("effectfulSend required");

  async function guardedSend(payload) {
    const started=commitSendStarted({bodyId,ownerId,workId,expectedUserTurnId,lock,ledger});
    if (started.sendStarted!==true) throw new GuardianCapabilityError("SEND_STARTED_NOT_DURABLE");
    return effectfulSend(SEND_TOKEN,payload);
  }

  return Object.freeze({ send: guardedSend });
}

export function createEffectfulSendPort(rawSend) {
  if (typeof rawSend !== "function") throw new TypeError("rawSend required");
  return async function guardianOnlyEffectfulSend(token,payload) {
    if (token!==SEND_TOKEN) throw new GuardianCapabilityError("INVALID_SEND_CAPABILITY");
    return rawSend(payload);
  };
}
