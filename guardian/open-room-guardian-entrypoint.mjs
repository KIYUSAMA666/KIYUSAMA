import { assembleFinalSessionAdapter } from "./final-session-adapter.mjs";

export class OpenRoomGuardianEntrypointError extends Error {
  constructor(reason){super("OPEN_ROOM_GUARDIAN_BLOCKED: "+reason);this.name="OpenRoomGuardianEntrypointError";this.reason=reason;}
}

export function enterOpenRoomWork({
  work, expected, authPreflight, exactBodyPreflight, lock, ledger,
  rawSend, rawResultCommit, observe, compose, captureReturn,
}) {
  if (!work || !expected) throw new OpenRoomGuardianEntrypointError("WORK_REQUIRED");
  if (typeof authPreflight!=="function" || typeof exactBodyPreflight!=="function")
    throw new OpenRoomGuardianEntrypointError("READ_ONLY_PREFLIGHT_REQUIRED");
  const auth=authPreflight();
  if (!auth || auth.pass!==true || auth.readOnly!==true)
    throw new OpenRoomGuardianEntrypointError("AUTH_NOT_PROVEN_READ_ONLY");
  const body=exactBodyPreflight();
  if (!body || body.pass!==true || body.readOnly!==true || body.bodyId!==expected.bodyId)
    throw new OpenRoomGuardianEntrypointError("EXACT_BODY_MISMATCH");
  for (const k of ["bodyId","ownerId","workId","expectedUserTurnId"])
    if (work[k]!==expected[k]) throw new OpenRoomGuardianEntrypointError("WORK_COORDINATE_MISMATCH:"+k);
  lock.acquire({bodyId:expected.bodyId,ownerId:expected.ownerId});
  try {
    const adapter=assembleFinalSessionAdapter({
      ...expected,lock,ledger,rawSend,rawResultCommit,observe,compose,captureReturn,
    });
    return Object.freeze({adapter,bodyId:expected.bodyId,ownerId:expected.ownerId,workId:expected.workId,sendCount:0});
  } catch (e) {
    lock.release({bodyId:expected.bodyId,ownerId:expected.ownerId});
    throw e;
  }
}
