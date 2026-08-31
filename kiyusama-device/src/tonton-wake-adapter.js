import { TontonError } from './tonton-core.js';

/**
 * Adapter boundary from TONTON into the existing OS WAKE layer.
 *
 * This module intentionally does NOT bind to Supabase, Gmail, Zapier,
 * or any specific runtime/provider. The concrete existing WAKE implementation
 * must be supplied later as dispatchWake only after its current identity and
 * runtime are verified.
 *
 * Contract:
 *   TONTON accepted payload -> existing WAKE contract
 *
 * HOLD boundary:
 *   No COMMON MEMORY storage implementation is called here.
 *   No Supabase client/import/URL/project identifier belongs here.
 */
export function createExistingWakeHandoff({ dispatchWake } = {}) {
  if (typeof dispatchWake !== 'function') {
    throw new TontonError('TONTON_WAKE_CONFIG_ERROR', 'dispatchWake is required');
  }

  return async function handoffToExistingWake({ signal, payload, evidence, nextCursor }) {
    const request = {
      kind: 'TONTON_WAKE',
      signalId: String(signal.id),
      source: signal.source ?? 'unknown',
      dedupeKey: signal.dedupeKey ?? null,
      payload,
      evidence: evidence ?? null,
      nextCursor: nextCursor ?? null,
    };

    const result = await dispatchWake(request);

    if (result === false || result?.accepted === false) {
      return { accepted: false };
    }

    return {
      accepted: true,
      wakeResult: result ?? null,
    };
  };
}
