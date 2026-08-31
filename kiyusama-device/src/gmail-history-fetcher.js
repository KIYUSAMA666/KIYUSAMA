const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me/history";

export async function fetchGmailHistory({
  accessToken,
  startHistoryId,
  fetchImpl = globalThis.fetch,
  maxPages = 50,
}) {
  if (!accessToken) throw new Error("accessToken is required");
  if (!startHistoryId) throw new Error("startHistoryId is required");
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl must be a function");
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error("maxPages must be >= 1");

  const history = [];
  const messageIds = new Set();
  let pageToken;
  let latestHistoryId = String(startHistoryId);

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(GMAIL_API_BASE);
    url.searchParams.set("startHistoryId", String(startHistoryId));
    url.searchParams.append("historyTypes", "messageAdded");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    let body;
    try {
      body = await response.json();
    } catch {
      body = {};
    }

    if (!response.ok) {
      const error = new Error(`Gmail history.list failed: HTTP ${response.status}`);
      error.status = response.status;
      error.details = body;
      throw error;
    }

    if (body.historyId) latestHistoryId = String(body.historyId);

    for (const entry of body.history ?? []) {
      history.push(entry);
      for (const added of entry.messagesAdded ?? []) {
        const id = added?.message?.id;
        if (id) messageIds.add(id);
      }
    }

    if (!body.nextPageToken) {
      return {
        startHistoryId: String(startHistoryId),
        latestHistoryId,
        history,
        messageIds: [...messageIds],
        pagesFetched: page + 1,
        truncated: false,
      };
    }

    pageToken = body.nextPageToken;
  }

  return {
    startHistoryId: String(startHistoryId),
    latestHistoryId,
    history,
    messageIds: [...messageIds],
    pagesFetched: maxPages,
    truncated: true,
    nextPageToken: pageToken,
  };
}
