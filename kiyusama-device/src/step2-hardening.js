const changed = (result) => result?.meta?.changes === 1 || result?.changes === 1;

export async function atomicAccept(db, delivery, nowMs = Date.now()) {
  const claim = db.prepare(`
    INSERT INTO delivery_claims
      (delivery_event_id, device_event_id, hop, accepted_at_ms)
    VALUES (?, ?, ?, ?)
  `).bind(delivery.delivery_event_id, delivery.device_event_id, delivery.hop, nowMs);
  const payload = db.prepare(`
    INSERT INTO durable_payloads (delivery_event_id, payload_json, persisted_at_ms)
    VALUES (?, ?, ?)
  `).bind(delivery.delivery_event_id, delivery.payload_json, nowMs);

  // D1 batch is transactional: if either statement fails, neither is committed.
  await db.batch([claim, payload]);
}

async function acquireDispatch(db, deviceEventId, hop, nowMs) {
  try {
    await db.prepare(`
      INSERT INTO dispatches
        (device_event_id, hop, state, claimed_at_ms, updated_at_ms)
      VALUES (?, ?, 'DISPATCHING', ?, ?)
    `).bind(deviceEventId, hop, nowMs, nowMs).run();
    return true;
  } catch (error) {
    // Constraint details vary across D1 runtimes. Confirm the row rather than
    // depending on an undocumented error class, code, or message.
    const existing = await db.prepare(`
      SELECT state FROM dispatches WHERE device_event_id = ? AND hop = ?
    `).bind(deviceEventId, hop).first();
    if (existing) return false;
    throw error;
  }
}

export async function dispatchOnce({
  db,
  deviceEventId,
  hop,
  providerPost,
  nowMs = Date.now(),
  crashAfterClaim = false,
  crashAfterPost = false,
}) {
  const winner = await acquireDispatch(db, deviceEventId, hop, nowMs);
  if (!winner) return { winner: false };
  if (crashAfterClaim) throw new Error('INJECTED_CRASH_AFTER_DISPATCH_CLAIM');

  const outcome = await providerPost();
  if (crashAfterPost) throw new Error('INJECTED_CRASH_AFTER_PROVIDER_POST');

  const result = await db.prepare(`
    UPDATE dispatches
    SET state = 'DISPATCHED', provider_session_id = ?, provider_run_id = ?, updated_at_ms = ?
    WHERE device_event_id = ? AND hop = ? AND state = 'DISPATCHING'
  `).bind(
    outcome.session_id ?? null,
    outcome.run_id ?? null,
    Date.now(),
    deviceEventId,
    hop,
  ).run();
  if (!changed(result)) throw new Error('DISPATCH_CLAIM_LOST_BEFORE_OUTCOME_PERSIST');
  return { winner: true, outcome };
}

export async function reconcileStaleDispatch({
  db,
  deviceEventId,
  hop,
  nowMs = Date.now(),
  dispatchTimeoutMs,
  proveOutcome,
}) {
  if (!Number.isFinite(dispatchTimeoutMs) || dispatchTimeoutMs <= 0) {
    throw new TypeError('dispatchTimeoutMs must be a positive finite number');
  }
  const cutoff = nowMs - dispatchTimeoutMs;
  const acquired = await db.prepare(`
    UPDATE dispatches
    SET state = 'RECONCILING', updated_at_ms = ?
    WHERE device_event_id = ? AND hop = ?
      AND state = 'DISPATCHING' AND claimed_at_ms <= ?
  `).bind(nowMs, deviceEventId, hop, cutoff).run();
  if (!changed(acquired)) return { reconciler: false };

  const outcome = await proveOutcome({ deviceEventId, hop });
  if (outcome) {
    await db.prepare(`
      UPDATE dispatches
      SET state = 'DISPATCHED', provider_session_id = ?, provider_run_id = ?, updated_at_ms = ?
      WHERE device_event_id = ? AND hop = ? AND state = 'RECONCILING'
    `).bind(
      outcome.session_id ?? null,
      outcome.run_id ?? null,
      nowMs,
      deviceEventId,
      hop,
    ).run();
    return { reconciler: true, state: 'DISPATCHED' };
  }

  await db.prepare(`
    UPDATE dispatches SET state = 'UNKNOWN_DISPATCH', updated_at_ms = ?
    WHERE device_event_id = ? AND hop = ? AND state = 'RECONCILING'
  `).bind(nowMs, deviceEventId, hop).run();
  return { reconciler: true, state: 'UNKNOWN_DISPATCH' };
}

