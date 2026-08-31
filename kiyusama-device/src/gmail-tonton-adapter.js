import { fetchGmailHistory } from './gmail-history-fetcher.js';

/**
 * TONTON Gmail bridge.
 *
 * The incoming signal is intentionally light: it only needs a Gmail historyId.
 * This adapter fetches the durable Gmail delta, hands message ids to the next
 * stage, and advances the durable cursor only after the handoff succeeds.
 *
 * Safety invariant:
 *   fetch -> handoff -> persist cursor
 * Never persist the cursor before the fetched message ids have been accepted.
 */
export async function processGmailTontonSignal({
  historyId,
  accessToken,
  fetchImpl = globalThis.fetch,
}, {
  handoffMessageIds,
  persistHistoryCursor,
  fetchHistory = fetchGmailHistory,
} = {}) {
  if (!historyId) throw new Error('historyId is required');
  if (!accessToken) throw new Error('accessToken is required');
  if (typeof handoffMessageIds !== 'function') throw new Error('handoffMessageIds is required');
  if (typeof persistHistoryCursor !== 'function') throw new Error('persistHistoryCursor is required');

  const result = await fetchHistory({
    accessToken,
    startHistoryId: String(historyId),
    fetchImpl,
  });

  // A bounded fetch must never silently advance the durable cursor.
  if (result.truncated) {
    const error = new Error('Gmail history fetch truncated before completion');
    error.code = 'GMAIL_HISTORY_TRUNCATED';
    error.fetchResult = result;
    throw error;
  }

  const handoff = await handoffMessageIds({
    source: 'gmail',
    startHistoryId: result.startHistoryId,
    latestHistoryId: result.latestHistoryId,
    messageIds: result.messageIds,
    history: result.history,
  });

  if (handoff === false) {
    const error = new Error('Gmail TONTON handoff was not accepted');
    error.code = 'GMAIL_TONTON_HANDOFF_REJECTED';
    throw error;
  }

  await persistHistoryCursor(String(result.latestHistoryId));

  return {
    accepted: true,
    messageCount: result.messageIds.length,
    startHistoryId: result.startHistoryId,
    latestHistoryId: result.latestHistoryId,
    pagesFetched: result.pagesFetched,
  };
}
