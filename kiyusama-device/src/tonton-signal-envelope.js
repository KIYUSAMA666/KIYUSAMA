import { createHash } from 'node:crypto';
import { TontonError } from './tonton-core.js';

export function normalizeTontonSignal(input) {
  if (!input || typeof input !== 'object') {
    throw new TontonError('TONTON_INVALID_SIGNAL', 'signal must be an object');
  }

  const source = String(input.source ?? '').trim();
  const externalId = String(input.externalId ?? input.id ?? '').trim();
  if (!source) throw new TontonError('TONTON_INVALID_SIGNAL', 'signal.source is required');
  if (!externalId) throw new TontonError('TONTON_INVALID_SIGNAL', 'signal.externalId or signal.id is required');

  const occurredAt = input.occurredAt ? String(input.occurredAt) : null;
  const hint = input.hint ?? null;
  const dedupeKey = createHash('sha256')
    .update(`${source}\n${externalId}`)
    .digest('hex');

  return {
    id: `${source}:${externalId}`,
    source,
    externalId,
    occurredAt,
    hint,
    dedupeKey,
  };
}
