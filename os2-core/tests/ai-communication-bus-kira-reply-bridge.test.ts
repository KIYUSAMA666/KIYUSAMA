import assert from "node:assert/strict";
import test from "node:test";

import type { BusMessage } from "../src/ai-communication-bus-core.js";
import { bridgeGenuineKiraReply, type GenuineKiraReplyRecord } from "../src/ai-communication-bus-kira-reply-bridge.js";
import type { ManagedWakeExecutorReceipt } from "../src/ai-communication-bus-live-kira-adapter.js";
import type { TransportEvidence } from "../src/ai-communication-bus-transport-evidence.js";

const request: BusMessage = {
  messageId: "req-117-b3-001",
  traceId: "trace-117-b3-001",
  kind: "MESSAGE",
  sourceAgentId: "SORA",
  targetAgentId: "KIRA",
  parentMessageId: null,
  current: { stateId: "state-117-b3", stateRevision: 119 },
  createdAt: "2026-09-14T00:00:00.000Z",
  payload: { task: "audit" },
};
const requestTransport: TransportEvidence = {
  provider: "slack",
  providerDeliveryId: "provider-request-117-b3",
  messageId: request.messageId,
  traceId: request.traceId,
  targetAgentId: request.targetAgentId,
  observedAt: "2026-09-14T00:00:01.000Z",
  status: "DELIVERED",
};
const executorReceipt: ManagedWakeExecutorReceipt = {
  ok: true,
  status: "REPLIED",
  trace_authentication: {
    device_model: "KIRA-BC",
    executed_function: "kira-managed-wake-executor-v1",
    message_id: "6a907c62-2350-43d9-98be-8e67c17ef4ba",
    receiver_execution_id: "receiver-exec-b3",
    agent_id: "KIRA",
    environment_id: "env-b3",
    reply_message_id: "4d8a1f4a-0cf8-4b57-a5c5-67cfed1d1a83",
    deployment_run_id: "deploy-b3",
    session_id: "session-b3",
  },
};
const genuineReply: GenuineKiraReplyRecord = {
  messageId: "4d8a1f4a-0cf8-4b57-a5c5-67cfed1d1a83",
  traceId: request.traceId,
  parentMessageId: request.messageId,
  sourceAgentId: "KIRA",
  targetAgentId: "SORA",
  stateId: request.current.stateId,
  stateRevision: 120,
  createdAt: "2026-09-14T00:00:05.000Z",
  payload: { result: "PASS" },
  provider: "managed-wake-reply",
  providerDeliveryId: "provider-reply-117-b3",
  observedAt: "2026-09-14T00:00:06.000Z",
};

function bridge(overrides: Partial<{
  executorReceipt: ManagedWakeExecutorReceipt;
  genuineReply: GenuineKiraReplyRecord;
}> = {}) {
  return bridgeGenuineKiraReply({ request, requestTransport, executorReceipt, genuineReply, ...overrides });
}

test("builds genuine KIRA BUS REPLY and verifies full round trip", () => {
  const decision = bridge();
  assert.equal(decision.status, "VERIFIED");
  if (decision.status !== "VERIFIED") return;
  assert.equal(decision.reply.kind, "REPLY");
  assert.equal(decision.reply.parentMessageId, request.messageId);
  assert.equal(decision.reply.traceId, request.traceId);
  assert.equal(decision.reply.sourceAgentId, "KIRA");
  assert.equal(decision.reply.targetAgentId, "SORA");
  assert.equal(decision.transport.messageId, genuineReply.messageId);
  assert.equal(decision.roundTrip.status, "VERIFIED");
});

test("rejects executor reply id substitution", () => {
  const decision = bridge({ genuineReply: { ...genuineReply, messageId: "997cbdcf-1486-4094-b680-a70fc8517c45" } });
  assert.deepEqual(decision, { status: "HOLD", reason: "EXECUTOR_REPLY_ID_MISMATCH" });
});

test("rejects missing authenticated executor reply evidence", () => {
  const decision = bridge({ executorReceipt: { ok: true, trace_authentication: { ...executorReceipt.trace_authentication, executed_function: "other" } } });
  assert.deepEqual(decision, { status: "HOLD", reason: "INVALID_EXECUTOR_REPLY_EVIDENCE" });
});

test("rejects trace substitution before round trip acceptance", () => {
  const decision = bridge({ genuineReply: { ...genuineReply, traceId: "trace-forged" } });
  assert.deepEqual(decision, { status: "HOLD", reason: "REPLY_MISMATCH" });
});

test("rejects parent substitution", () => {
  const decision = bridge({ genuineReply: { ...genuineReply, parentMessageId: "other-parent" } });
  assert.deepEqual(decision, { status: "HOLD", reason: "REPLY_MISMATCH" });
});

test("rejects route substitution", () => {
  const decision = bridge({ genuineReply: { ...genuineReply, sourceAgentId: "THIRD_AGENT" } });
  assert.deepEqual(decision, { status: "HOLD", reason: "REPLY_MISMATCH" });
});

test("rejects CURRENT rollback", () => {
  const decision = bridge({ genuineReply: { ...genuineReply, stateRevision: 118 } });
  assert.deepEqual(decision, { status: "HOLD", reason: "CURRENT_BINDING_MISMATCH" });
});
