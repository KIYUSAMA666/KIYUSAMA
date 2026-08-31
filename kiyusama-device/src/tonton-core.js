export class TontonError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'TontonError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Transport-independent TONTON core.
 *
 * TONTON does not trust or depend on any specific provider. A transport
 * (mail, webhook, queue, local process, etc.) only supplies a lightweight
 * signal. The core resolves durable payload, hands it off, and commits the
 * cursor/ack only after acceptance.
 *
 * Invariant: resolve -> handoff -> commit
 */
export async function processTontonSignal(signal, {
  resolvePayload,
  handoff,
  commit,
} = {}) {
  if (!signal || typeof signal !== 'object') {
    throw new TontonError('TONTON_INVALID_SIGNAL', 'signal must be an object');
  }
  if (!signal.id) {
    throw new TontonError('TONTON_INVALID_SIGNAL', 'signal.id is required');
  }
  if (typeof resolvePayload !== 'function') {
    throw new TontonError('TONTON_CONFIG_ERROR', 'resolvePayload is required');
  }
  if (typeof handoff !== 'function') {
    throw new TontonError('TONTON_CONFIG_ERROR', 'handoff is required');
  }
  if (typeof commit !== 'function') {
    throw new TontonError('TONTON_CONFIG_ERROR', 'commit is required');
  }

  const resolved = await resolvePayload(signal);
  if (!resolved || typeof resolved !== 'object') {
    throw new TontonError('TONTON_RESOLVE_FAILED', 'resolvePayload returned no durable payload');
  }
  if (resolved.complete === false) {
    throw new TontonError('TONTON_INCOMPLETE', 'durable payload resolution is incomplete', resolved);
  }

  const accepted = await handoff({
    signal,
    payload: resolved.payload,
    evidence: resolved.evidence ?? null,
    nextCursor: resolved.nextCursor ?? null,
  });

  if (accepted === false || accepted?.accepted === false) {
    throw new TontonError('TONTON_HANDOFF_REJECTED', 'handoff was not accepted');
  }

  await commit({
    signal,
    nextCursor: resolved.nextCursor ?? null,
    evidence: resolved.evidence ?? null,
    handoffResult: accepted,
  });

  return {
    ok: true,
    signalId: String(signal.id),
    nextCursor: resolved.nextCursor ?? null,
  };
}
