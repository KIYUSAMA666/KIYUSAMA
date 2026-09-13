import test from "node:test";
import assert from "node:assert/strict";
import type { BusDeliveryRecord, BusMessage } from "../src/ai-communication-bus-core.js";
import {
  applyKiraWakeResult,
  createKiraWakeReply,
  prepareKiraWake,
  type KiraWakeBridgeRecord,
} from "../src/ai-communication-bus-kira-wake-bridge.js";

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

test("prepares exactly one KIRA wake from delivered BUS message", () => {
  const result = prepareKiraWake(null, delivery());
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.value.status, "PENDING");
  assert.equal(result.value.messageId, "bus-kira-001");
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

test("ambiguous Managed Agent result becomes UNKNOWN and never claims success", () => {
  const result = applyKiraWakeResult(pending(), {
    outcome: "AMBIGUOUS",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.value.status, "UNKNOWN");
});

test("explicit rejection terminalizes wake", () => {
  const result = applyKiraWakeResult(pending(), {
    outcome: "REJECTED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.value.status, "TERMINAL_FAILED");
});

test("consumed result requires exact BUS binding", () => {
  const result = applyKiraWakeResult(pending(), {
    outcome: "CONSUMED",
    messageId: "other-message",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "WAKE_BINDING_MISMATCH" });
});

test("provider cannot grant authority through wake result", () => {
  const result = applyKiraWakeResult(pending(), {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:01:00.000Z",
    authorityGranted: true,
  });
  assert.deepEqual(result, { status: "HOLD", reason: "AUTHORITY_ESCALATION_FORBIDDEN" });
});

test("confirmed KIRA wake requires durable run and session evidence", () => {
  const result = applyKiraWakeResult(pending(), {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:01:00.000Z",
  });
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.value.status, "CONFIRMED");
  assert.equal(result.value.deploymentRunId, "run-001");
  assert.equal(result.value.sessionId, "session-001");
});

test("same consumed evidence after confirmation is idempotent", () => {
  const first = applyKiraWakeResult(pending(), {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
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
    deploymentRunId: "run-001",
    sessionId: "session-001",
    observedAt: "2026-09-13T07:02:00.000Z",
  });
  assert.equal(second.status, "IDEMPOTENT");
});

test("conflicting consumed evidence after confirmation is held", () => {
  const first = applyKiraWakeResult(pending(), {
    outcome: "CONSUMED",
    messageId: "bus-kira-001",
    traceId: "trace-kira-001",
    targetAgentId: "KIRA",
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
  assert.deepEqual(createKiraWakeReply(parent, pending(), reply), {
    status: "HOLD",
    reason: "REPLY_NOT_CONFIRMED",
  });
});

test("confirmed KIRA wake may create exact bound reply", () => {
  const parent = message();
  const confirmed = applyKiraWakeResult(pending(), {
    outcome: "CONSUMED",
    messageId: parent.messageId,
    traceId: parent.traceId,
    targetAgentId: "KIRA",
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
