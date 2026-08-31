import test from 'node:test';
import assert from 'node:assert/strict';
import { processGmailTontonSignal } from '../../src/gmail-tonton-adapter.js';

const signal = { historyId: '100', accessToken: 'token' };

function completeFetch(overrides = {}) {
  return async () => ({
    startHistoryId: '100',
    latestHistoryId: '200',
    messageIds: ['m1', 'm2'],
    history: [{ id: '150' }],
    pagesFetched: 1,
    truncated: false,
    ...overrides,
  });
}

test('TONTON-01 — fetches durable delta, hands off, then persists cursor', async () => {
  const trace = [];
  const result = await processGmailTontonSignal(signal, {
    fetchHistory: async (args) => {
      trace.push(['fetch', args.startHistoryId]);
      return completeFetch()();
    },
    handoffMessageIds: async (payload) => {
      trace.push(['handoff', payload.messageIds]);
      return true;
    },
    persistHistoryCursor: async (cursor) => {
      trace.push(['persist', cursor]);
    },
  });

  assert.deepEqual(trace, [
    ['fetch', '100'],
    ['handoff', ['m1', 'm2']],
    ['persist', '200'],
  ]);
  assert.equal(result.accepted, true);
  assert.equal(result.messageCount, 2);
});

test('TONTON-02 — rejected handoff never advances cursor', async () => {
  let persisted = false;
  await assert.rejects(
    processGmailTontonSignal(signal, {
      fetchHistory: completeFetch(),
      handoffMessageIds: async () => false,
      persistHistoryCursor: async () => { persisted = true; },
    }),
    (error) => error.code === 'GMAIL_TONTON_HANDOFF_REJECTED',
  );
  assert.equal(persisted, false);
});

test('TONTON-03 — truncated history never hands off or advances cursor', async () => {
  let handedOff = false;
  let persisted = false;
  await assert.rejects(
    processGmailTontonSignal(signal, {
      fetchHistory: completeFetch({ truncated: true, nextPageToken: 'next' }),
      handoffMessageIds: async () => { handedOff = true; },
      persistHistoryCursor: async () => { persisted = true; },
    }),
    (error) => error.code === 'GMAIL_HISTORY_TRUNCATED',
  );
  assert.equal(handedOff, false);
  assert.equal(persisted, false);
});

test('TONTON-04 — fetch failure never reaches handoff or cursor', async () => {
  let handedOff = false;
  let persisted = false;
  await assert.rejects(
    processGmailTontonSignal(signal, {
      fetchHistory: async () => { throw new Error('gmail unavailable'); },
      handoffMessageIds: async () => { handedOff = true; },
      persistHistoryCursor: async () => { persisted = true; },
    }),
    /gmail unavailable/,
  );
  assert.equal(handedOff, false);
  assert.equal(persisted, false);
});
