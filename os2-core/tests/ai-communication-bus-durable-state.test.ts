import test from "node:test";
import assert from "node:assert/strict";
import {
  markDurableBusUnknown,
  mayBlindlyRetryRecoveredBusRecord,
  reconcileDurableBusUnknown,
  recoverDurableBusRecord,
  toDurableBusRecord,
} from "../src/ai-communication-bus-durable-state.js";
import type { BusDeliveryRecord, BusMessage } from "../src/ai-communication-bus-core.js";

function message(): BusMessage {
  return {
    messageId: "BUS-DUR-1",
    traceId: "TRACE-DUR-1",
    kind: "MESSAGE",
    sourceAgentId: "SORA",
    targetAgentId: "KIRA",
    parentMessageId: null,
    current: { stateId: "CS-BUS", stateRevision: 7 },
    createdAt: "2026-09-13T14:00:00+09:00",
    payload: { text: "hello" },
  };
}

function pending(): BusDeliveryRecord {
  return {
    message: message(),
    status: "PENDING",
    deliveredToAgentId: null,
    acknowledgedByAgentId: null,
  };
}

function delivered(): BusDeliveryRecord {
  return {
    message: message(),
    status: "DELIVERED",
    deliveredToAgentId: "KIRA",
    acknowledgedByAgentId: null,
  };
}

const current = { stateId: "CS-BUS", stateRevision: 7 };

test("1 PENDING converts to durable state", () => {
  const result = toDurableBusRecord(pending(), 0, "2026-09-13T14:00:01+09:00");
  assert.equal(result.status, "ACCEPTED");
  if (result.status === "ACCEPTED") assert.equal(result.value.status, "PENDING");
});

test("2 DELIVERED converts with target binding intact", () => {
  const result = toDurableBusRecord(delivered(), 1, "2026-09-13T14:00:02+09:00");
  assert.equal(result.status, "ACCEPTED");
  if (result.status === "ACCEPTED") assert.equal(result.value.deliveredToAgentId, "KIRA");
});

test("3 invalid durable delivery shape fails closed", () => {
  const forged = { ...delivered(), deliveredToAgentId: "ATTACKER" };
  assert.deepEqual(toDurableBusRecord(forged, 1, "2026-09-13T14:00:02+09:00"), {
    status: "HOLD",
    reason: "INVALID_DURABLE_RECORD",
  });
});

test("4 ambiguous PENDING delivery becomes durable UNKNOWN", () => {
  const durable = toDurableBusRecord(pending(), 1, "2026-09-13T14:00:02+09:00");
  assert.equal(durable.status, "ACCEPTED");
  if (durable.status !== "ACCEPTED") return;
  const unknown = markDurableBusUnknown(durable.value, "TRANSPORT_TIMEOUT_AFTER_SEND", "2026-09-13T14:00:03+09:00");
  assert.equal(unknown.status, "ACCEPTED");
  if (unknown.status === "ACCEPTED") assert.equal(unknown.value.status, "UNKNOWN");
});

test("5 duplicate UNKNOWN mark with same reason is idempotent", () => {
  const durable = toDurableBusRecord(pending(), 1, "2026-09-13T14:00:02+09:00");
  if (durable.status !== "ACCEPTED") throw new Error("fixture");
  const first = markDurableBusUnknown(durable.value, "TIMEOUT", "2026-09-13T14:00:03+09:00");
  if (first.status !== "ACCEPTED") throw new Error("fixture");
  const second = markDurableBusUnknown(first.value, "TIMEOUT", "2026-09-13T14:00:04+09:00");
  assert.equal(second.status, "IDEMPOTENT");
});

test("6 conflicting UNKNOWN reason cannot rewrite ambiguity", () => {
  const durable = toDurableBusRecord(pending(), 1, "2026-09-13T14:00:02+09:00");
  if (durable.status !== "ACCEPTED") throw new Error("fixture");
  const first = markDurableBusUnknown(durable.value, "TIMEOUT", "2026-09-13T14:00:03+09:00");
  if (first.status !== "ACCEPTED") throw new Error("fixture");
  assert.deepEqual(markDurableBusUnknown(first.value, "OTHER", "2026-09-13T14:00:04+09:00"), {
    status: "HOLD",
    reason: "INVALID_STATE_TRANSITION",
  });
});

test("7 restart recovers PENDING without inventing delivery", () => {
  const durable = toDurableBusRecord(pending(), 0, "2026-09-13T14:00:01+09:00");
  if (durable.status !== "ACCEPTED") throw new Error("fixture");
  const recovered = recoverDurableBusRecord(structuredClone(durable.value), current);
  assert.equal(recovered.status, "RECOVERED");
  if (recovered.status === "RECOVERED") assert.equal(recovered.disposition, "PENDING_DELIVERY");
});

test("8 restart recovers UNKNOWN as no-retry observation", () => {
  const durable = toDurableBusRecord(pending(), 1, "2026-09-13T14:00:02+09:00");
  if (durable.status !== "ACCEPTED") throw new Error("fixture");
  const unknown = markDurableBusUnknown(durable.value, "TIMEOUT", "2026-09-13T14:00:03+09:00");
  if (unknown.status !== "ACCEPTED") throw new Error("fixture");
  const recovered = recoverDurableBusRecord(structuredClone(unknown.value), current);
  assert.equal(recovered.status, "RECOVERED");
  if (recovered.status === "RECOVERED") assert.equal(recovered.disposition, "UNKNOWN_NO_RETRY");
});

test("9 recovered UNKNOWN cannot be blindly retried", () => {
  const durable = toDurableBusRecord(pending(), 1, "2026-09-13T14:00:02+09:00");
  if (durable.status !== "ACCEPTED") throw new Error("fixture");
  const unknown = markDurableBusUnknown(durable.value, "TIMEOUT", "2026-09-13T14:00:03+09:00");
  if (unknown.status !== "ACCEPTED") throw new Error("fixture");
  assert.deepEqual(mayBlindlyRetryRecoveredBusRecord(unknown.value), {
    status: "HOLD",
    reason: "UNKNOWN_REQUIRES_RECONCILIATION",
  });
});

test("10 stale/foreign CURRENT binding is rejected on recovery", () => {
  const durable = toDurableBusRecord(pending(), 0, "2026-09-13T14:00:01+09:00");
  if (durable.status !== "ACCEPTED") throw new Error("fixture");
  assert.deepEqual(recoverDurableBusRecord(durable.value, { stateId: "CS-BUS", stateRevision: 8 }), {
    status: "HOLD",
    reason: "CURRENT_BINDING_MISMATCH",
  });
});

test("11 forged ACK state cannot be recovered", () => {
  const durable = toDurableBusRecord(pending(), 0, "2026-09-13T14:00:01+09:00");
  if (durable.status !== "ACCEPTED") throw new Error("fixture");
  const forged = {
    ...durable.value,
    status: "ACKNOWLEDGED",
    deliveredToAgentId: null,
    acknowledgedByAgentId: "KIRA",
  };
  assert.deepEqual(recoverDurableBusRecord(forged, current), {
    status: "HOLD",
    reason: "INVALID_DURABLE_RECORD",
  });
});

test("12 UNKNOWN reconciles to DELIVERED only with explicit observation", () => {
  const durable = toDurableBusRecord(pending(), 1, "2026-09-13T14:00:02+09:00");
  if (durable.status !== "ACCEPTED") throw new Error("fixture");
  const unknown = markDurableBusUnknown(durable.value, "TIMEOUT", "2026-09-13T14:00:03+09:00");
  if (unknown.status !== "ACCEPTED") throw new Error("fixture");
  const resolved = reconcileDurableBusUnknown(unknown.value, "DELIVERED", "2026-09-13T14:00:04+09:00");
  assert.equal(resolved.status, "ACCEPTED");
  if (resolved.status === "ACCEPTED") {
    assert.equal(resolved.value.status, "DELIVERED");
    assert.equal(resolved.value.deliveredToAgentId, "KIRA");
  }
});

test("13 UNKNOWN reconciles to PENDING only after explicit NOT_DELIVERED observation", () => {
  const durable = toDurableBusRecord(pending(), 1, "2026-09-13T14:00:02+09:00");
  if (durable.status !== "ACCEPTED") throw new Error("fixture");
  const unknown = markDurableBusUnknown(durable.value, "TIMEOUT", "2026-09-13T14:00:03+09:00");
  if (unknown.status !== "ACCEPTED") throw new Error("fixture");
  const resolved = reconcileDurableBusUnknown(unknown.value, "NOT_DELIVERED", "2026-09-13T14:00:04+09:00");
  assert.equal(resolved.status, "ACCEPTED");
  if (resolved.status === "ACCEPTED") assert.equal(resolved.value.status, "PENDING");
});

test("14 malformed recovered row fails closed without throwing", () => {
  assert.deepEqual(recoverDurableBusRecord({ nope: true }, current), {
    status: "HOLD",
    reason: "INVALID_DURABLE_RECORD",
  });
});
