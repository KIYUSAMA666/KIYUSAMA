// Ownership-transfer shim for the legacy external-body adapter.
// No browser action is performed here. The legacy effectful click may only be
// installed behind Guardian's private effectful port.

import { createEffectfulSendPort, createGuardianSendCapability } from "./send-capability.mjs";
import { createExternalBodyAdapterBoundary, assertNoRawSendSurface } from "./external-body-adapter-boundary.mjs";

export function wireLegacyAdapterBehindGuardian({
  bodyId, ownerId, workId, expectedUserTurnId, lock, ledger,
  legacyObserve, legacyCompose, legacyCapture,
  legacyEffectfulClick,
}) {
  if (typeof legacyEffectfulClick!=="function") throw new TypeError("legacyEffectfulClick required");

  // Ownership transfer: raw legacy click is captured only in this closure.
  // It is never returned to the adapter/public boundary.
  const guardianEffectfulPort=createEffectfulSendPort(async payload=>legacyEffectfulClick(payload));
  const guardianCapability=createGuardianSendCapability({
    bodyId,ownerId,workId,expectedUserTurnId,lock,ledger,effectfulSend:guardianEffectfulPort,
  });

  const adapter=createExternalBodyAdapterBoundary({
    guardianCapability,
    observe:legacyObserve,
    compose:legacyCompose,
    capture:legacyCapture,
  });
  assertNoRawSendSurface(adapter);
  return adapter;
}
