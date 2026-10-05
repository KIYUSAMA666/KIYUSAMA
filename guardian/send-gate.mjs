import { transition } from "./control-core.mjs";
export class SendGateError extends Error {}
const deny = reason => { throw new SendGateError(reason); };
function owned(lock, bodyId, ownerId) {
 const value = lock.read();
 if (!value || value.bodyId !== bodyId || value.ownerId !== ownerId) deny("LOCK_NOT_OWNED");
}
function prepared(entry, bodyId, ownerId, workId) {
 if (!entry || entry.bodyId !== bodyId || entry.ownerId !== ownerId || entry.workId !== workId) deny("LEDGER_COORDINATE_MISMATCH");
 if (entry.state !== "LOCKED" || entry.phase !== "PRE_SEND" || entry.sendStarted !== false || entry.resultCommitted !== false) deny("PRE_SEND_REQUIRED");
}
/** All adapters must call this gate; no browser or SEND effect occurs here.
 * Caller must serialize ownership/ledger changes for the entire operation.
 */
export function beginSending({ lock, ledger, bodyId, ownerId, workId }) {
 for (const value of [bodyId, ownerId, workId]) if (typeof value !== "string" || !value.trim()) deny("COORDINATE_REQUIRED");
 owned(lock, bodyId, ownerId);
 const before = ledger.get(bodyId);
 prepared(before, bodyId, ownerId, workId);
 if (!Number.isSafeInteger(before.seq) || before.seq < 1) deny("INVALID_LEDGER_SEQUENCE");
 // Record SEND_STARTED before returning permission. Failure never grants SEND.
 const written = ledger.record(bodyId, {
  ...before, state: transition(before.state, "SENDING"),
  phase: "SEND_STARTED", sendStarted: true
 });
 const persisted = ledger.get(bodyId);
 if (!persisted || persisted.seq !== written.seq || persisted.seq !== before.seq + 1 ||
     persisted.bodyId !== bodyId || persisted.ownerId !== ownerId ||
     persisted.workId !== workId || persisted.state !== "SENDING" ||
     persisted.phase !== "SEND_STARTED" || persisted.sendStarted !== true ||
     persisted.resultCommitted !== false) deny("SEND_STARTED_READBACK_FAILED");
 owned(lock, bodyId, ownerId);
 return Object.freeze({ state: "SENDING", bodyId, ownerId, workId, ledgerSeq: persisted.seq });
}
