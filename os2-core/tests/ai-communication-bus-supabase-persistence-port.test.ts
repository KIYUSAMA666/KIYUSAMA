import assert from "node:assert/strict";
import test from "node:test";

import type { BusDeliveryRecord, BusMessage } from "../src/ai-communication-bus-core.js";
import { createSupabaseBusPersistencePort } from "../src/ai-communication-bus-supabase-persistence-port.js";
import type { TransportEvidence } from "../src/ai-communication-bus-transport-evidence.js";

const message: BusMessage = {
  messageId: "msg-1",
  traceId: "trace-1",
  kind: "MESSAGE",
  sourceAgentId: "SORA",
  targetAgentId: "KIRA",
  parentMessageId: null,
  current: { stateId: "state-1", stateRevision: 7 },
  createdAt: "2026-09-13T13:00:00.000Z",
  payload: { purpose: "test" },
};

const delivery: BusDeliveryRecord = {
  message,
  status: "DELIVERED",
  deliveredToAgentId: "KIRA",
  acknowledgedByAgentId: null,
};

const evidence: TransportEvidence = {
  provider: "SLACK",
  providerDeliveryId: "1789302184.338689",
  messageId: "msg-1",
  traceId: "trace-1",
  targetAgentId: "KIRA",
  observedAt: "2026-09-13T13:00:01.000Z",
  status: "DELIVERED",
};

test("calls exact atomic BUS persistence RPC once and accepts exact STORED receipt", async () => {
  const calls: unknown[] = [];
  const port = createSupabaseBusPersistencePort({
    async rpc(functionName, args) {
      calls.push({ functionName, args });
      return {
        data: {
          status: "STORED",
          storedMessageId: message.messageId,
          storedTraceId: message.traceId,
          storedProviderDeliveryId: evidence.providerDeliveryId,
        },
        error: null,
      };
    },
  });

  const result = await port.persistBusAndTransport({ message, delivery, evidence });
  assert.deepEqual(result, {
    ok: true,
    storedMessageId: "msg-1",
    storedTraceId: "trace-1",
    storedProviderDeliveryId: "1789302184.338689",
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    functionName: "os2_bus_persist_delivered_with_transport",
    args: { p_message: message, p_delivery: delivery, p_evidence: evidence },
  });
});

test("accepts exact IDEMPOTENT receipt", async () => {
  const port = createSupabaseBusPersistencePort({
    async rpc() {
      return {
        data: {
          status: "IDEMPOTENT",
          storedMessageId: message.messageId,
          storedTraceId: message.traceId,
          storedProviderDeliveryId: evidence.providerDeliveryId,
        },
        error: null,
      };
    },
  });
  assert.equal((await port.persistBusAndTransport({ message, delivery, evidence })).ok, true);
});

test("forged provider delivery id fails closed", async () => {
  const port = createSupabaseBusPersistencePort({
    async rpc() {
      return {
        data: {
          status: "STORED",
          storedMessageId: message.messageId,
          storedTraceId: message.traceId,
          storedProviderDeliveryId: "forged",
        },
        error: null,
      };
    },
  });
  assert.deepEqual(await port.persistBusAndTransport({ message, delivery, evidence }), { ok: false });
});

test("binding substitution fails closed", async () => {
  const port = createSupabaseBusPersistencePort({
    async rpc() {
      return {
        data: {
          status: "STORED",
          storedMessageId: "other-message",
          storedTraceId: message.traceId,
          storedProviderDeliveryId: evidence.providerDeliveryId,
        },
        error: null,
      };
    },
  });
  assert.deepEqual(await port.persistBusAndTransport({ message, delivery, evidence }), { ok: false });
});

test("provider error fails closed", async () => {
  const port = createSupabaseBusPersistencePort({
    async rpc() {
      return { data: null, error: new Error("provider") };
    },
  });
  assert.deepEqual(await port.persistBusAndTransport({ message, delivery, evidence }), { ok: false });
});

test("provider throw fails closed", async () => {
  const port = createSupabaseBusPersistencePort({
    async rpc() {
      throw new Error("network");
    },
  });
  assert.deepEqual(await port.persistBusAndTransport({ message, delivery, evidence }), { ok: false });
});

test("unknown backend status fails closed", async () => {
  const port = createSupabaseBusPersistencePort({
    async rpc() {
      return { data: { status: "BACKEND_FAILURE" }, error: null };
    },
  });
  assert.deepEqual(await port.persistBusAndTransport({ message, delivery, evidence }), { ok: false });
});
