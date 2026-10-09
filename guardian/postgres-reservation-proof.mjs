// Isolated PostgreSQL checkpoint mapper. No network or browser effects.
export function mapReservationCheckpoint(row, expected) {
  const c = row?.checkpoint;
  if (!c || row.root_task_id !== expected.rootTaskId ||
      row.checkpoint_id !== expected.checkpointId ||
      row.checkpoint_revision !== expected.expectedRevision + 1 ||
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
