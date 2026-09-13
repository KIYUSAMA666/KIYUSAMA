import test from "node:test";
import assert from "node:assert/strict";
import type { BusDeliveryRecord, BusMessage } from "../src/ai-communication-bus-core.js";
import {
  applyKiraWakeResult,
  attachKiraWakeDispatchEvidence,
  createKiraWakeReply,
  prepareKiraWake,
  type KiraWakeBridgeRecord,
} from "../src/ai-communication-bus-kira-wake-bridge.js";

const WAKE_MESSAGE_ID = "259c01c3-8c82-47ee-affc-6aa2b1254735";

function message(overrides: Partial<BusMessage> = {}): BusMessage {
  return {
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    kind: "MESSAGE",
    sourceAgentId: "SORA-3",
    targetAgentId: "KIRA",
    parentMessageId: null,
    current: { stateId: "current-001", stateRevision: 7 },
    createdAt: "2026-09-13T07:00:00.000Z",
    payload: { text: "wake KIRA" },
    ...overrides,
  };
}

function delivery(overrides: Partial<BusDeliveryRecord> = {}): BusDeliveryRecord {
  return {
    message: message(),
    status: "DELIVERED",
    deliveredToAgentId: "KIRA",
    acknowledgedByAgentId: null,
    ...overrides,
  };
}

function pending(): KiraWakeBridgeRecord {
  const result = prepareKiraWake(null, delivery());
  assert.equal(result.status, "ACCEPTED");
  return result.value;
}

function dispatched(): KiraWakeBridgeRecord {
  const result = attachKiraWakeDispatchEvidence(pending(), {
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    observedAt: "2026-09-13T07:00:30.000Z",
  });
  assert.equal(result.status, "ACCEPTED");
  return result.value;
}

test("prepares exactly one KIRA wake from delivered BUS message", () => {
  const result = prepareKiraWake(null, delivery());
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.value.status, "PENDING");
  assert.equal(result.value.messageId, "bus-kira-001");
  assert.equal(result.value.wakeMessageId, null);
});

test("duplicate prepare is idempotent and cannot create second wake", () => {
  const first = pending();
  const result = prepareKiraWake(first, delivery());
  assert.equal(result.status, "IDEMPOTENT");
  assert.deepEqual(result.value, first);
});

test("wrong target is held", () => {
  const wrong = delivery({
    message: message({ targetAgentId: "SORA-1" }),
    deliveredToAgentId: "SORA-1",
  });
  assert.deepEqual(prepareKiraWake(null, wrong), { status: "HOLD", reason: "INVALID_TARGET" });
});

test("pending BUS message cannot wake KIRA", () => {
  assert.deepEqual(
    prepareKiraWake(null, delivery({ status: "PENDING", deliveredToAgentId: null })),
    { status: "HOLD", reason: "INVALID_BUS_STATE" },
  );
});

test("managed wake UUID is bound to the exact BUS message and trace", () => {
  const result = attachKiraWakeDispatchEvidence(pending(), {
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    observedAt: "2026-09-13T07:00:30.000Z",
  });
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.value.wakeMessageId, WAKE_MESSAGE_ID);
});

test("malformed managed wake UUID is rejected", () => {
  const result = attachKiraWakeDispatchEvidence(pending(), {
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: "not-a-uuid",
    observedAt: "2026-09-13T07:00:30.000Z",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "INVALID_WAKE_EVIDENCE" });
});

test("conflicting wake UUID for same BUS message is held", () => {
  const first = dispatched();
  const result = attachKiraWakeDispatchEvidence(first, {
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: "ddb89350-fc13-40da-8862-9a1e1aca801d",
    observedAt: "2026-09-13T07:00:40.000Z",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "WAKE_CONFLICT" });
});

test("ambiguous Managed Agent result becomes UNKNOWN and never claims success", () => {
  const result = applyKiraWakeResult(dispatched(), {
    outcome: "AMBIGUOUS",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.value.status, "UNKNOWN");
});

test("explicit rejection terminalizes wake", () => {
  const result = applyKiraWakeResult(dispatched(), {
    outcome: "REJECTED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.value.status, "TERMINAL_FAILED");
});

test("consumed result requires exact BUS binding", () => {
  const result = applyKiraWakeResult(dispatched(), {
    outcome: "CONSUMED",
    messageId: "other-message",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "WAKE_BINDING_MISMATCH" });
});

test("consumed result requires exact managed wake UUID", () => {
  const result = applyKiraWakeResult(dispatched(), {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: "ddb89350-fc13-40da-8862-9a1e1aca801d",
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "WAKE_BINDING_MISMATCH" });
});

test("provider cannot grant authority through wake result", () => {
  const result = applyKiraWakeResult(dispatched(), {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:01:00.000Z",
    authorityGranted: true,
  });
  assert.deepEqual(result, { status: "HOLD", reason: "AUTHORITY_ESCALATION_FORBIDDEN" });
});

test("confirmed KIRA wake requires durable wake UUID, run and session evidence", () => {
  const result = applyKiraWakeResult(dispatched(), {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.value.status, "CONFIRMED");
  assert.equal(result.value.wakeMessageId, WAKE_MESSAGE_ID);
  assert.equal(result.value.deploymentRunId, "run-001");
  assert.equal(result.value.sessionId, "session-001");
});

test("same consumed evidence after confirmation is idempotent", () => {
  const first = applyKiraWakeResult(dispatched(), {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.equal(first.status, "ACCEPTED");
  const second = applyKiraWakeResult(first.value, {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:02:00.000Z",
  });
  assert.equal(second.status, "IDEMPOTENT");
});

test("conflicting consumed evidence after confirmation is held", () => {
  const first = applyKiraWakeResult(dispatched(), {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.equal(first.status, "ACCEPTED");
  const second = applyKiraWakeResult(first.value, {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    deploymentRunId: "run-002",
    sessionId: "session-002",
    observedAt: "2026-09-13T07:02:00.000Z",
  });
  assert.deepEqual(second, { status: "HOLD", reason: "INVALID_WAKE_TRANSITION" });
});

test("KIRA reply cannot exist before confirmed wake", () => {
  const parent = message();
  const reply = message({
    messageId: "reply-001",
    kind: "REPLY",
    sourceAgentId: "KIRA",
    targetAgentId: "SORA-3",
    parentMessageId: parent.messageId,
    createdAt: "2026-09-13T07:02:00.000Z",
  });
  assert.deepEqual(createKiraWakeReply(parent, dispatched(), reply), {
    status: "HOLD",
    reason: "REPLY_NOT_CONFIRMED",
  });
});

test("confirmed KIRA wake may create exact bound reply", () => {
  const parent = message();
  const confirmed = applyKiraWakeResult(dispatched(), {
    outcome: "CONSUMED",
    messageId: parent.messageId,
    traceId: parent.traceId,
    targetAgentId: "KIRA",
    wakeMessageId: WAKE_MESSAGE_ID,
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.equal(confirmed.status, "ACCEPTED");
  const reply = message({
    messageId: "reply-001",
    kind: "REPLY",
    sourceAgentId: "KIRA",
    targetAgentId: "SORA-3",
    parentMessageId: parent.messageId,
    createdAt: "2026-09-13T07:02:00.000Z",
  });
  const result = createKiraWakeReply(parent, confirmed.value, reply);
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.value.parentMessageId, parent.messageId);
  assert.equal(result.value.traceId, parent.traceId);
});
