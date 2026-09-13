import test from "node:test";
import assert from "node:assert/strict";
import {
  createSlackOutboundText,
  slackSendResultToEvidence,
} from "../src/ai-communication-bus-slack-adapter.js";

const message = {
  messageId: "bus-slack-1",
  traceId: "trace-slack-1",
  kind: "MESSAGE" as const,
  sourceAgentId: "SORA",
  targetAgentId: "KIRA",
  parentMessageId: null,
  current: { stateId: "CURRENT", stateRevision: 1 },
  createdAt: "2026-09-13T05:40:00.000Z",
  payload: { type: "BUS_LIVE_PROBE", value: "PING" },
};

test("slack outbound text preserves bus identity and payload", () => {
  const parsed = JSON.parse(createSlackOutboundText(message));
  assert.equal(parsed.messageId, message.messageId);
  assert.equal(parsed.traceId, message.traceId);
  assert.equal(parsed.targetAgentId, message.targetAgentId);
  assert.deepEqual(parsed.payload, message.payload);
});

test("valid Slack send result becomes DELIVERED transport evidence", () => {
  const result = slackSendResultToEvidence({
    message,
    expectedChannelId: "C0BU98EN7J9",
    sendResult: {
      channelId: "C0BU98EN7J9",
      messageTs: "1789278000.123456",
      messageLink: "https://example.slack.com/archives/C0BU98EN7J9/p1789278000123456",
    },
    observedAt: "2026-09-13T05:40:01.000Z",
  });
  assert.equal(result.status, "EVIDENCE");
  if (result.status === "EVIDENCE") {
    assert.equal(result.evidence.provider, "SLACK");
    assert.equal(result.evidence.providerDeliveryId, "1789278000.123456");
    assert.equal(result.evidence.status, "DELIVERED");
  }
});

test("missing Slack result is UNKNOWN, never DELIVERED", () => {
  assert.deepEqual(
    slackSendResultToEvidence({ message, expectedChannelId: "C0BU98EN7J9", sendResult: null, observedAt: "2026-09-13T05:40:01.000Z" }),
    { status: "UNKNOWN", reason: "SLACK_SEND_RESULT_AMBIGUOUS" },
  );
});

test("wrong Slack channel is HOLD", () => {
  const result = slackSendResultToEvidence({
    message,
    expectedChannelId: "C0BU98EN7J9",
    sendResult: {
      channelId: "C-OTHER",
      messageTs: "1789278000.123456",
      messageLink: "https://example.slack.com/archives/COTHER/p1789278000123456",
    },
    observedAt: "2026-09-13T05:40:01.000Z",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "SLACK_CHANNEL_MISMATCH" });
});

test("missing messageTs is HOLD", () => {
  const result = slackSendResultToEvidence({
    message,
    expectedChannelId: "C0BU98EN7J9",
    sendResult: { channelId: "C0BU98EN7J9", messageLink: "https://example.slack.com/archives/C0BU98EN7J9/p1" },
    observedAt: "2026-09-13T05:40:01.000Z",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "INVALID_SLACK_SEND_RESULT" });
});

test("non-Slack link is HOLD", () => {
  const result = slackSendResultToEvidence({
    message,
    expectedChannelId: "C0BU98EN7J9",
    sendResult: { channelId: "C0BU98EN7J9", messageTs: "1789278000.123456", messageLink: "https://example.com/not-slack" },
    observedAt: "2026-09-13T05:40:01.000Z",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "INVALID_SLACK_SEND_RESULT" });
});

test("malformed Slack ts is HOLD", () => {
  const result = slackSendResultToEvidence({
    message,
    expectedChannelId: "C0BU98EN7J9",
    sendResult: { channelId: "C0BU98EN7J9", messageTs: "not-a-ts", messageLink: "https://example.slack.com/archives/C0BU98EN7J9/p1" },
    observedAt: "2026-09-13T05:40:01.000Z",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "INVALID_SLACK_SEND_RESULT" });
});

test("invalid observedAt is HOLD", () => {
  const result = slackSendResultToEvidence({
    message,
    expectedChannelId: "C0BU98EN7J9",
    sendResult: {
      channelId: "C0BU98EN7J9",
      messageTs: "1789278000.123456",
      messageLink: "https://example.slack.com/archives/C0BU98EN7J9/p1",
    },
    observedAt: "not-a-time",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "INVALID_SLACK_SEND_RESULT" });
});
