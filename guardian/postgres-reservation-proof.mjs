// Isolated PostgreSQL checkpoint mapper. No network or browser effects.
// PostgreSQL int8 may arrive as a decimal string (depending on the client).
// Reject fractional/unsafe JS numbers; compare integer revisions without coercion.
function asPgInt8(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  throw new Error("RESERVATION_PROOF_INVALID");
}

export function mapReservationCheckpoint(row, expected) {
  if (!expected || !row) throw new Error("RESERVATION_PROOF_INVALID");
  let revisionMatches = false;
  try {
    const current = asPgInt8(row.checkpoint_revision);
    const prior = asPgInt8(expected.expectedRevision);
    revisionMatches = prior >= 0n && current === prior + 1n;
  } catch { throw new Error("RESERVATION_PROOF_INVALID"); }
  const c = row?.checkpoint;
  if (!c || row.root_task_id !== expected.rootTaskId ||
      row.checkpoint_id !== expected.checkpointId ||
      !revisionMatches ||
      c.bodyId !== expected.bodyId || c.workId !== expected.workId ||
      c.expectedUserTurnId !== expected.expectedUserTurnId ||
      c.ownerId !== expected.ownerId || c.leaseToken !== expected.leaseToken ||
      c.fenceEpoch !== expected.fenceEpoch ||
      c.state !== "SENDING" || c.sendStarted !== true ||
      c.preSendCommitted !== true || c.resultCommitted !== false)
    throw new Error("RESERVATION_PROOF_INVALID");
  return Object.freeze({
    ok: true, state: c.state, sendStarted: c.sendStarted,
    bodyId: c.bodyId, workId: c.workId,
    expectedUserTurnId: c.expectedUserTurnId, ownerId: c.ownerId,
    fenceEpoch: c.fenceEpoch, revision: row.checkpoint_revision
  });
}
