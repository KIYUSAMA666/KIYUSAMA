// Cloud-facing SEND reservation contract. No browser or network SEND is performed here.
// The injected reserve() MUST implement an atomic, fenced database transaction.
export class CloudSendReservationError extends Error {
  constructor(reason) { super("CLOUD_SEND_BLOCKED: " + reason); this.name = "CloudSendReservationError"; this.reason = reason; }
}
const present = v => typeof v === "string" && v.trim().length > 0;
export async function reserveCloudSend({ bodyId, workId, expectedUserTurnId, ownerId, leaseToken, fenceEpoch, expectedRevision, reserve }) {
  if (![bodyId, workId, expectedUserTurnId, ownerId, leaseToken].every(present) ||
      !Number.isSafeInteger(fenceEpoch) || fenceEpoch < 1 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      typeof reserve !== "function")
    throw new CloudSendReservationError("COORDINATE_REQUIRED");
  // A failed/ambiguous transaction is never a permission to retry a browser SEND.
  let result;
  try {
    result = await reserve({ bodyId, workId, expectedUserTurnId, ownerId, leaseToken, fenceEpoch, expectedRevision });
  } catch {
    throw new CloudSendReservationError("RESERVATION_UNCERTAIN");
  }
  if (!result || result.ok !== true || result.state !== "SENDING" ||
      result.sendStarted !== true || result.bodyId !== bodyId ||
      result.workId !== workId || result.expectedUserTurnId !== expectedUserTurnId ||
      result.ownerId !== ownerId || result.fenceEpoch !== fenceEpoch ||
      result.revision !== expectedRevision + 1)
    throw new CloudSendReservationError("RESERVATION_NOT_PROVEN");
  return Object.freeze({ ...result });
}
