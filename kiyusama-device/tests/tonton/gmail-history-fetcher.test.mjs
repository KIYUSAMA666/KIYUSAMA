import test from "node:test";
import assert from "node:assert/strict";
import { fetchGmailHistory } from "../../src/gmail-history-fetcher.js";

test("fetches one page and returns message ids", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          historyId: "200",
          history: [
            { id: "150", messagesAdded: [{ message: { id: "m1" } }] },
            { id: "160", messagesAdded: [{ message: { id: "m2" } }] },
          ],
        };
      },
    };
  };

  const result = await fetchGmailHistory({
    accessToken: "token",
    startHistoryId: "100",
    fetchImpl,
  });

  assert.equal(result.latestHistoryId, "200");
  assert.deepEqual(result.messageIds, ["m1", "m2"]);
  assert.equal(result.pagesFetched, 1);
  assert.equal(result.truncated, false);
  assert.match(calls[0].url, /startHistoryId=100/);
  assert.match(calls[0].url, /historyTypes=messageAdded/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer token");
});

test("follows nextPageToken and deduplicates messages", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        if (n === 1) {
          return {
            historyId: "201",
            nextPageToken: "next",
            history: [{ id: "180", messagesAdded: [{ message: { id: "m1" } }] }],
          };
        }
        return {
          historyId: "250",
          history: [{ id: "220", messagesAdded: [{ message: { id: "m1" } }, { message: { id: "m3" } }] }],
        };
      },
    };
  };

  const result = await fetchGmailHistory({
    accessToken: "token",
    startHistoryId: "100",
    fetchImpl,
  });

  assert.equal(result.pagesFetched, 2);
  assert.equal(result.latestHistoryId, "250");
  assert.deepEqual(result.messageIds, ["m1", "m3"]);
});

test("surfaces Gmail API errors without hiding details", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    async json() {
      return { error: { message: "historyId too old" } };
    },
  });

  await assert.rejects(
    fetchGmailHistory({ accessToken: "token", startHistoryId: "1", fetchImpl }),
    (error) => {
      assert.equal(error.status, 404);
      assert.equal(error.details.error.message, "historyId too old");
      return true;
    },
  );
});
