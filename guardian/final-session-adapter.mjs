import { assembleGuardianSessionCapabilities } from "./guardian-session-assembly.mjs";
import { createExternalBodyAdapterBoundary, assertNoRawSendSurface } from "./external-body-adapter-boundary.mjs";

export class FinalSessionAdapterError extends Error {
 constructor(reason){super("FINAL_SESSION_ADAPTER_BLOCKED: "+reason);this.name="FinalSessionAdapterError";this.reason=reason;}
}

export function assembleFinalSessionAdapter({
 bodyId,ownerId,workId,expectedUserTurnId,lock,ledger,rawSend,rawResultCommit,
 observe,compose,captureReturn,
}) {
 if (typeof captureReturn!=="function") throw new FinalSessionAdapterError("CAPTURE_RETURN_REQUIRED");
 const session=assembleGuardianSessionCapabilities({bodyId,ownerId,workId,expectedUserTurnId,lock,ledger,rawSend,rawResultCommit});
 const adapter=createExternalBodyAdapterBoundary({
  guardianCapability:Object.freeze({send:session.send}),
  observe,compose,
  capture:async(...args)=>session.capture(await captureReturn(...args)),
 });
 assertNoRawSendSurface(adapter);
 return Object.freeze({...adapter,resumePendingResult:session.resumePendingResult});
}

export function rejectSeparatedCapabilityAssembly(args={}) {
 for(const k of ["guardian_send","guardian_capture","guardianSend","guardianCapture"])
  if(k in args) throw new FinalSessionAdapterError("SEPARATE_CAPABILITY_INJECTION_FORBIDDEN:"+k);
 return assembleFinalSessionAdapter(args);
}
