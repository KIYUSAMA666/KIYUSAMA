import { commitReturnResult } from "./return-gate.mjs";

const RETURN_TOKEN = Symbol("GUARDIAN_RETURN_TOKEN");

export class ReturnCapabilityError extends Error {
  constructor(reason){ super("RETURN_CAPABILITY_BLOCKED: "+reason); this.name="ReturnCapabilityError"; this.reason=reason; }
}

export function createGuardianReturnCapability({ ledger, effectfulResultCommit }) {
  if (typeof effectfulResultCommit!=="function") throw new TypeError("effectfulResultCommit required");
  return Object.freeze({
    commit: async proof => {
      const saved=commitReturnResult({...proof,ledger});
      return effectfulResultCommit(RETURN_TOKEN,{proof,saved});
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
