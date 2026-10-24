// Non-effectful boundary between the existing external-body adapter and Guardian.
// The adapter receives exactly one authority-bearing function: guardianSend.
// No raw browser SEND primitive is accepted or exposed here.

export class AdapterBoundaryError extends Error {
  constructor(reason){ super("ADAPTER_BOUNDARY_BLOCKED: "+reason); this.name="AdapterBoundaryError"; this.reason=reason; }
}

export function createExternalBodyAdapterBoundary({ guardianCapability, observe, compose, capture }) {
  if (!guardianCapability || typeof guardianCapability.send!=="function")
    throw new AdapterBoundaryError("GUARDIAN_CAPABILITY_REQUIRED");
  for (const [name,fn] of Object.entries({observe,compose,capture})) {
    if (fn!==undefined && typeof fn!=="function") throw new TypeError(name+" must be a function");
  }

  const api={
    observe: (...args)=>observe?.(...args),
    compose: (...args)=>compose?.(...args),
    send: (payload)=>guardianCapability.send(payload),
    capture: (...args)=>capture?.(...args),
  };
  return Object.freeze(api);
}

export function assertNoRawSendSurface(adapter) {
  const forbidden=["rawSend","clickSend","click_send_once","sendOnceEvidence","page","driver","surface"];
  for (const key of forbidden) {
    if (key in adapter) throw new AdapterBoundaryError("RAW_SEND_SURFACE_EXPOSED:"+key);
  }
  return true;
}
