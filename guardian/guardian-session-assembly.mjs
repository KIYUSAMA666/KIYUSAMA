import { createEffectfulSendPort, createGuardianSendCapability } from "./send-capability.mjs";
import { createGuardianReturnCapability, createEffectfulResultCommitPort } from "./return-capability.mjs";

export class GuardianSessionAssemblyError extends Error {
  constructor(reason){ super("GUARDIAN_SESSION_ASSEMBLY_BLOCKED: "+reason); this.name="GuardianSessionAssemblyError"; this.reason=reason; }
}

export function assembleGuardianSessionCapabilities({
  bodyId, ownerId, workId, expectedUserTurnId, lock, ledger, rawSend, rawResultCommit,
}) {
  if (!bodyId || !ownerId || !workId || !expectedUserTurnId || !lock || !ledger)
    throw new GuardianSessionAssemblyError("SESSION_COORDINATE_REQUIRED");
  if (typeof rawSend!=="function" || typeof rawResultCommit!=="function")
    throw new GuardianSessionAssemblyError("EFFECTFUL_PORTS_REQUIRED");

  const sendPort=createEffectfulSendPort(rawSend);
  const resultPort=createEffectfulResultCommitPort(rawResultCommit);
  const sendCapability=createGuardianSendCapability({bodyId,ownerId,workId,expectedUserTurnId,lock,ledger,effectfulSend:sendPort});
  const returnCapability=createGuardianReturnCapability({ledger,effectfulResultCommit:resultPort});

  const capture=async observed => {
    if (!observed || typeof observed!=="object") throw new GuardianSessionAssemblyError("RETURN_OBSERVATION_REQUIRED");
    return returnCapability.commit({
      bodyId,ownerId,workId,expectedUserTurnId,
      causalUserTurnId:observed.causalUserTurnId,
      assistantTurnId:observed.assistantTurnId,
      streamEnded:observed.streamEnded,
      contentStable:observed.contentStable,
      sameBody:observed.sameBody,
    });
  };

  return Object.freeze({send:sendCapability.send,capture});
}
