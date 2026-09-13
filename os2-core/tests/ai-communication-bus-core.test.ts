import test from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgeBusMessage,
  createBusReply,
  deliverBusMessage,
  publishBusMessage,
  type BusDeliveryRecord,
  type BusMessage,
} from "../src/ai-communication-bus-core.js";

function message(overrides: Partial<BusMessage> = {}): BusMessage {
  return {
    messageId: "MSG-1",
    traceId: "TRACE-1",
    kind: "MESSAGE",
    sourceAgentId: "SORA",
    targetAgentId: "KIRA",
    parentMessageId: null,
    current: { stateId: "CS-BUS", stateRevision: 30 },
    createdAt: "2026-09-13T14:00:00+09:00",
    payload: { text: "audit this" },
    ...overrides,
  };
}

function pending(): BusDeliveryRecord {
  const decision = publishBusMessage(null, message());
  assert.equal(decision.status, "ACCEPTED");
  return decision.value;
}

test("1 publish creates one pending durable identity", () => {
  const decision = publishBusMessage(null, message());
  assert.equal(decision.status, "ACCEPTED");
  assert.equal(decision.value.status, "PENDING");
  assert.equal(decision.value.message.messageId, "MSG-1");
});

test("2 exact duplicate publish is idempotent", () => {
  const first = pending();
  const second = publishBusMessage(first, message());
  assert.equal(second.status, "IDEMPOTENT");
  assert.deepEqual(second.value, first);
});

test("3 conflicting duplicate messageId is HOLD", () => {
  const first = pending();
  assert.deepEqual(publishBusMessage(first, message({ targetAgentId: "5GO" })), {
    status: "HOLD",
    reason: "MESSAGE_ID_CONFLICT",
  });
});

test("4 wrong recipient delivery is HOLD", () => {
  assert.deepEqual(deliverBusMessage(pending(), "3GO"), {
    status: "HOLD",
    reason: "WRONG_RECIPIENT",
  });
});

test("5 exact target delivery succeeds once and duplicate is idempotent", () => {
  const first = deliverBusMessage(pending(), "KIRA");
  assert.equal(first.status, "ACCEPTED");
  assert.equal(first.value.status, "DELIVERED");
  const duplicate = deliverBusMessage(first.value, "KIRA");
  assert.equal(duplicate.status, "IDEMPOTENT");
});

test("6 ACK must come from the declared recipient and bind message/trace", () => {
  const delivered = deliverBusMessage(pending(), "KIRA");
  assert.equal(delivered.status, "ACCEPTED");
  assert.deepEqual(
    acknowledgeBusMessage(delivered.value, {
      messageId: "MSG-1",
      traceId: "TRACE-1",
      recipientAgentId: "SORA",
    }),
    { status: "HOLD", reason: "ACK_MISMATCH" },
  );
});

test("7 valid ACK succeeds once and duplicate ACK is idempotent", () => {
  const delivered = deliverBusMessage(pending(), "KIRA");
  assert.equal(delivered.status, "ACCEPTED");
  const ack = { messageId: "MSG-1", traceId: "TRACE-1", recipientAgentId: "KIRA" };
  const first = acknowledgeBusMessage(delivered.value, ack);
  assert.equal(first.status, "ACCEPTED");
  assert.equal(first.value.status, "ACKNOWLEDGED");
  const second = acknowledgeBusMessage(first.value, ack);
  assert.equal(second.status, "IDEMPOTENT");
});

test("8 self-loop is forbidden in v1", () => {
  assert.deepEqual(publishBusMessage(null, message({ targetAgentId: "SORA" })), {
    status: "HOLD",
    reason: "SELF_LOOP_FORBIDDEN",
  });
});

test("9 protected CURRENT control fields cannot ride in payload", () => {
  assert.deepEqual(
    publishBusMessage(null, message({ payload: { activeRolesAndAuthority: { EXECUTION_AUTHORITY: "ATTACKER" } } })),
    { status: "HOLD", reason: "INVALID_MESSAGE" },
  );
});

test("10 reply must reverse sender/target and bind parent trace", () => {
  const parent = message();
  const reply = message({
    messageId: "MSG-2",
    kind: "REPLY",
    sourceAgentId: "KIRA",
    targetAgentId: "SORA",
    parentMessageId: "MSG-1",
    createdAt: "2026-09-13T14:01:00+09:00",
  });
  const decision = createBusReply(parent, reply);
  assert.equal(decision.status, "ACCEPTED");
});

test("11 wrong parent or trace reply is HOLD", () => {
  const parent = message();
  assert.deepEqual(
    createBusReply(parent, message({
      messageId: "MSG-2",
      traceId: "TRACE-ATTACK",
      kind: "REPLY",
      sourceAgentId: "KIRA",
      targetAgentId: "SORA",
      parentMessageId: "MSG-X",
    })),
    { status: "HOLD", reason: "REPLY_MISMATCH" },
  );
});

test("12 stale reply CURRENT revision is HOLD", () => {
  const parent = message();
  assert.deepEqual(
    createBusReply(parent, message({
      messageId: "MSG-2",
      kind: "REPLY",
      sourceAgentId: "KIRA",
      targetAgentId: "SORA",
      parentMessageId: "MSG-1",
      current: { stateId: "CS-BUS", stateRevision: 29 },
    })),
    { status: "HOLD", reason: "CURRENT_BINDING_MISMATCH" },
  );
});

test("13 malformed identifiers or timestamps HOLD without throwing", () => {
  assert.deepEqual(publishBusMessage(null, message({ messageId: " ", createdAt: "not-a-date" })), {
    status: "HOLD",
    reason: "INVALID_MESSAGE",
  });
});
