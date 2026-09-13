import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTransportEvidence, type TransportEvidence } from "../src/ai-communication-bus-transport-evidence.js";
import type { DurableBusRecord } from "../src/ai-communication-bus-durable-state.js";

function record(status: DurableBusRecord["status"] = "PENDING"): DurableBusRecord {
  return {
    message: {
      messageId: "BUS-MSG-1",
      traceId: "TRACE-1",
      kind: "MESSAGE",
      sourceAgentId: "SORA",
      targetAgentId: "KIRA",
      parentMessageId: null,
      current: { stateId: "CS-BUS", stateRevision: 7 },
      createdAt: "2026-09-13T14:25:00+09:00",
      payload: { text: "ping" },
    },
    status,
    deliveredToAgentId: status === "DELIVERED" || status === "ACKNOWLEDGED" ? "KIRA" : null,
    acknowledgedByAgentId: status === "ACKNOWLEDGED" ? "KIRA" : null,
    attemptSequence: 0,
    updatedAt: "2026-09-13T14:25:00+09:00",
    unknownReason: status === "UNKNOWN" ? "provider timeout" : null,
  };
}

function evidence(overrides: Partial<TransportEvidence> = {}): TransportEvidence {
  return {
    provider: "TEST_PROVIDER",
    providerDeliveryId: "PD-1",
    messageId: "BUS-MSG-1",
    traceId: "TRACE-1",
    targetAgentId: "KIRA",
    observedAt: "2026-09-13T14:25:01+09:00",
    status: "DELIVERED",
    ...overrides,
  };
}

test("1 explicit delivered evidence is accepted", () => {
  assert.equal(evaluateTransportEvidence(record(), evidence()).status, "DELIVERED");
});

test("2 delivered without provider delivery id is rejected", () => {
  assert.deepEqual(evaluateTransportEvidence(record(), evidence({ providerDeliveryId: null })), { status: "HOLD", reason: "INVALID_EVIDENCE" });
});

test("3 ambiguous transport outcome becomes UNKNOWN", () => {
  const decision = evaluateTransportEvidence(record(), evidence({ status: "AMBIGUOUS", providerDeliveryId: null }));
  assert.equal(decision.status, "UNKNOWN");
});

test("4 provider rejection never becomes delivered", () => {
  assert.deepEqual(evaluateTransportEvidence(record(), evidence({ status: "REJECTED" })), { status: "HOLD", reason: "PROVIDER_REJECTED" });
});

test("5 wrong message id is held", () => {
  assert.deepEqual(evaluateTransportEvidence(record(), evidence({ messageId: "OTHER" })), { status: "HOLD", reason: "MESSAGE_BINDING_MISMATCH" });
});

test("6 wrong trace id is held", () => {
  assert.deepEqual(evaluateTransportEvidence(record(), evidence({ traceId: "OTHER" })), { status: "HOLD", reason: "TRACE_BINDING_MISMATCH" });
});

test("7 wrong target is held", () => {
  assert.deepEqual(evaluateTransportEvidence(record(), evidence({ targetAgentId: "SORA" })), { status: "HOLD", reason: "TARGET_BINDING_MISMATCH" });
});

test("8 malformed provider is held", () => {
  assert.deepEqual(evaluateTransportEvidence(record(), evidence({ provider: " " })), { status: "HOLD", reason: "INVALID_EVIDENCE" });
});

test("9 malformed observedAt is held", () => {
  assert.deepEqual(evaluateTransportEvidence(record(), evidence({ observedAt: "not-time" })), { status: "HOLD", reason: "INVALID_EVIDENCE" });
});

test("10 ACKNOWLEDGED record cannot be re-delivered", () => {
  assert.deepEqual(evaluateTransportEvidence(record("ACKNOWLEDGED"), evidence()), { status: "HOLD", reason: "INVALID_SOURCE_STATE" });
});

test("11 TERMINAL_FAILED record cannot be re-delivered", () => {
  assert.deepEqual(evaluateTransportEvidence(record("TERMINAL_FAILED"), evidence()), { status: "HOLD", reason: "INVALID_SOURCE_STATE" });
});

test("12 UNKNOWN may accept later explicit delivered evidence", () => {
  assert.equal(evaluateTransportEvidence(record("UNKNOWN"), evidence()).status, "DELIVERED");
});
