import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTontonSignal } from '../../src/tonton-signal-envelope.js';

test('ENVELOPE-01 — normalizes provider-neutral signal', () => {
  const result = normalizeTontonSignal({ source: 'local', externalId: 'evt-1', hint: { kind: 'wake' } });
  assert.equal(result.id, 'local:evt-1');
  assert.equal(result.source, 'local');
  assert.equal(result.externalId, 'evt-1');
  assert.equal(result.hint.kind, 'wake');
  assert.match(result.dedupeKey, /^[a-f0-9]{64}$/);
});

test('ENVELOPE-02 — same source/externalId yields same dedupe key', () => {
  const a = normalizeTontonSignal({ source: 'local', externalId: 'evt-1' });
  const b = normalizeTontonSignal({ source: 'local', externalId: 'evt-1', occurredAt: 'later' });
  assert.equal(a.dedupeKey, b.dedupeKey);
});

test('ENVELOPE-03 — different externalId changes dedupe key', () => {
  const a = normalizeTontonSignal({ source: 'local', externalId: 'evt-1' });
  const b = normalizeTontonSignal({ source: 'local', externalId: 'evt-2' });
  assert.notEqual(a.dedupeKey, b.dedupeKey);
});

test('ENVELOPE-04 — rejects missing source', () => {
  assert.throws(() => normalizeTontonSignal({ externalId: 'evt-1' }), (e) => e.code === 'TONTON_INVALID_SIGNAL');
});

test('ENVELOPE-05 — rejects missing external id', () => {
  assert.throws(() => normalizeTontonSignal({ source: 'local' }), (e) => e.code === 'TONTON_INVALID_SIGNAL');
});
