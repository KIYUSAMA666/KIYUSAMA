import { createGuardianReturnCapability, createEffectfulResultCommitPort } from "./return-capability.mjs";

export class ReturnWiringError extends Error {
  constructor(reason){ super("RETURN_WIRING_BLOCKED: "+reason); this.name="ReturnWiringError"; this.reason=reason; }
}

export function createReturnAdapterGuardianWiring({
  bodyId, ownerId, workId, expectedUserTurnId, ledger, captureReturn, rawResultCommit,
}) {
  if (!bodyId || !ownerId || !workId || !expectedUserTurnId || !ledger)
    throw new ReturnWiringError("RETURN_CONTEXT_REQUIRED");
  if (typeof captureReturn !== "function") throw new TypeError("captureReturn required");
  if (typeof rawResultCommit !== "function") throw new TypeError("rawResultCommit required");

  const effectfulResultCommit=createEffectfulResultCommitPort(rawResultCommit);
  const guardianReturn=createGuardianReturnCapability({ledger,effectfulResultCommit});

  return Object.freeze({
    capture: async (...args) => {
      const observed=await captureReturn(...args);
      if (!observed || typeof observed!=="object") throw new ReturnWiringError("RETURN_OBSERVATION_REQUIRED");
      const proof={
        bodyId, ownerId, workId, expectedUserTurnId,
        causalUserTurnId: observed.causalUserTurnId,
        assistantTurnId: observed.assistantTurnId,
        streamEnded: observed.streamEnded,
        contentStable: observed.contentStable,
        sameBody: observed.sameBody,
      };
      return guardianReturn.commit(proof);
    }
  });
}

export function assertNoRawReturnAuthority(adapter) {
  const forbidden=["rawResultCommit","commitReturnResult","effectfulResultCommit","ledger","guardianReturn","captureReturn"];
  for (const key of forbidden) if (key in adapter)
    throw new ReturnWiringError("RAW_RETURN_AUTHORITY_EXPOSED:"+key);
  return true;
}
