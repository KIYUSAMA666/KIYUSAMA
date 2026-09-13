import assert from "node:assert/strict";
import test from "node:test";

import type { BusMessage } from "../src/ai-communication-bus-core.js";
import type { TransportEvidence } from "../src/ai-communication-bus-transport-evidence.js";
import { verifyBusRoundTripEvidence } from "../src/ai-communication-bus-round-trip-evidence.js";

const request: BusMessage = {
  messageId: "msg-request-001",
  traceId: "trace-roundtrip-001",
  kind: "MESSAGE",
  sourceAgentId: "SORA",
  targetAgentId: "KIRA",
  parentMessageId: null,
  current: { stateId: "state-001", stateRevision: 7 },
  createdAt: "2026-09-13T11:00:00.000Z",
  payload: { task: "review" },
};

const reply: BusMessage = {
  messageId: "msg-reply-001",
  traceId: request.traceId,
  kind: "REPLY",
  sourceAgentId: "KIRA",
  targetAgentId: "SORA",
  parentMessageId: request.messageId,
  current: { stateId: request.current.stateId, stateRevision: 8 },
  createdAt: "2026-09-13T11:00:05.000Z",
  payload: { result: "PASS" },
};

const requestTransport: TransportEvidence = {
  provider: "slack",
  providerDeliveryId: "delivery-request-001",
  messageId: request.messageId,
  traceId: request.traceId,
  targetAgentId: request.targetAgentId,
  observedAt: "2026-09-13T11:00:01.000Z",
  status: "DELIVERED",
};

const replyTransport: TransportEvidence = {
  provider: "slack",
  providerDeliveryId: "delivery-reply-001",
  messageId: reply.messageId,
  traceId: reply.traceId,
  targetAgentId: reply.targetAgentId,
  observedAt: "2026-09-13T11:00:06.000Z",
  status: "DELIVERED",
};

function verify(overrides: Partial<{
  request: BusMessage;
  requestTransport: TransportEvidence;
  reply: BusMessage;
  replyTransport: TransportEvidence;
}> = {}) {
  return verifyBusRoundTripEvidence({
    request,
    requestTransport,
    reply,
    replyTransport,
    ...overrides,
  });
}

test("verifies exact SORA to KIRA to SORA round trip evidence", () => {
  const decision = verify();
  assert.equal(decision.status, "VERIFIED");
});

test("rejects ambiguous request transport", () => {
  const decision = verify({
    requestTransport: { ...requestTransport, status: "AMBIGUOUS", providerDeliveryId: null },
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "REQUEST_TRANSPORT_NOT_DELIVERED" });
});

test("rejects rejected reply transport", () => {
  const decision = verify({
    replyTransport: { ...replyTransport, status: "REJECTED", providerDeliveryId: null },
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "REPLY_TRANSPORT_NOT_DELIVERED" });
});

test("rejects forged request delivery binding", () => {
  const decision = verify({
    requestTransport: { ...requestTransport, messageId: "foreign-message" },
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "REQUEST_BINDING_MISMATCH" });
});

test("rejects forged reply delivery binding", () => {
  const decision = verify({
    replyTransport: { ...replyTransport, targetAgentId: "THIRD_AGENT" },
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "REPLY_BINDING_MISMATCH" });
});

test("rejects trace substitution", () => {
  const forgedReply = { ...reply, traceId: "trace-other" };
  const forgedTransport = { ...replyTransport, traceId: forgedReply.traceId };
  const decision = verify({ reply: forgedReply, replyTransport: forgedTransport });
  assert.deepEqual(decision, { status: "HOLD", reason: "TRACE_MISMATCH" });
});

test("rejects parent substitution", () => {
  const decision = verify({ reply: { ...reply, parentMessageId: "msg-other" } });
  assert.deepEqual(decision, { status: "HOLD", reason: "PARENT_MISMATCH" });
});

test("rejects route substitution", () => {
  const forgedReply = { ...reply, sourceAgentId: "THIRD_AGENT" };
  const decision = verify({ reply: forgedReply });
  assert.deepEqual(decision, { status: "HOLD", reason: "ROUTE_MISMATCH" });
});

test("rejects state id substitution", () => {
  const decision = verify({
    reply: { ...reply, current: { ...reply.current, stateId: "state-other" } },
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "CURRENT_BINDING_MISMATCH" });
});

test("rejects state revision rollback", () => {
  const decision = verify({
    reply: { ...reply, current: { ...reply.current, stateRevision: 6 } },
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "CURRENT_BINDING_MISMATCH" });
});

test("rejects reply missing reply kind", () => {
  const decision = verify({ reply: { ...reply, kind: "MESSAGE", parentMessageId: null } });
  assert.deepEqual(decision, { status: "HOLD", reason: "INVALID_REPLY_KIND" });
});

test("requires non-empty provider delivery ids for both legs", () => {
  const first = verify({ requestTransport: { ...requestTransport, providerDeliveryId: "" } });
  assert.deepEqual(first, { status: "HOLD", reason: "REQUEST_BINDING_MISMATCH" });

  const second = verify({ replyTransport: { ...replyTransport, providerDeliveryId: "" } });
  assert.deepEqual(second, { status: "HOLD", reason: "REPLY_BINDING_MISMATCH" });
});
