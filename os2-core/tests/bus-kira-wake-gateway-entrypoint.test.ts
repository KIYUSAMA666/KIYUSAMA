import test from "node:test";
import assert from "node:assert/strict";
import type { BusMessage } from "../src/ai-communication-bus-core.js";
import {
  admitBusKiraWakeGatewayDispatch,
  BUS_KIRA_WAKE_GATEWAY_ADAPTER_ID,
  type BusKiraWakeGatewayDispatch,
} from "../src/bus-kira-wake-gateway-entrypoint.js";

const message: BusMessage = {
  messageId: "bus-message-128",
  traceId: "trace-128",
  kind: "MESSAGE",
  sourceAgentId: "SORA",
  targetAgentId: "KIRA",
  parentMessageId: null,
  current: { stateId: "state-128", stateRevision: 7 },
  createdAt: "2026-09-14T14:20:00.000Z",
  payload: { text: "audit" },
};

const busIdentity = {
  messageId: message.messageId,
  traceId: message.traceId,
  stateId: message.current.stateId,
  stateRevision: message.current.stateRevision,
};

function dispatch(overrides: Partial<BusKiraWakeGatewayDispatch> = {}): BusKiraWakeGatewayDispatch {
  return {
    dispatch_id: "dispatch-128",
    execution_id: "execution-128",
    task_id: "task-128",
    generation: 4,
    adapter_id: BUS_KIRA_WAKE_GATEWAY_ADAPTER_ID,
    operation: "RUN_BUS_KIRA_WAKE",
    route_mode: "DIRECT_REVERSIBLE",
    target_scope: "KIRA",
    request_payload: { bus_identity: busIdentity },
    evidence: { bus_identity: busIdentity },
    status: "RUNNING",
    claimed_worker_id: "worker-128",
    claimed_worker_epoch: 9,
    worker_epoch: 9,
    ...overrides,
  };
}

const request = {
  dispatchId: "dispatch-128",
  workerId: "worker-128",
  workerEpoch: 9,
  message,
};

test("PASS for exact BUS adapter + post-permit binding + BUS identity", () => {
  const result = admitBusKiraWakeGatewayDispatch({ request, dispatch: dispatch() });
  assert.equal(result.status, "PASS");
  if (result.status === "PASS") {
    assert.equal(result.generation, 4);
    assert.equal(result.executionId, "execution-128");
  }
});

test("HOLD when another adapter dispatch reaches BUS gateway", () => {
  const result = admitBusKiraWakeGatewayDispatch({
    request,
    dispatch: dispatch({ adapter_id: "GITHUB_GATEWAY_V1" }),
  });
  assert.deepEqual(result, { status: "HOLD", reason: "ADAPTER_MISMATCH" });
});

test("HOLD when claimed worker changed after durable permit consumption", () => {
  const result = admitBusKiraWakeGatewayDispatch({
    request,
    dispatch: dispatch({ claimed_worker_id: "worker-raced" }),
  });
  assert.deepEqual(result, { status: "HOLD", reason: "POST_PERMIT_BINDING_CHANGED" });
});

test("HOLD when claimed worker epoch changed after durable permit consumption", () => {
  const result = admitBusKiraWakeGatewayDispatch({
    request,
    dispatch: dispatch({ claimed_worker_epoch: 10, worker_epoch: 10 }),
  });
  assert.deepEqual(result, { status: "HOLD", reason: "POST_PERMIT_BINDING_CHANGED" });
});

test("HOLD on request BUS identity mismatch", () => {
  const result = admitBusKiraWakeGatewayDispatch({
    request,
    dispatch: dispatch({
      request_payload: { bus_identity: { ...busIdentity, traceId: "wrong-trace" } },
    }),
  });
  assert.deepEqual(result, {
    status: "HOLD",
    reason: "BUS_IDENTITY_HOLD",
    detail: "REQUEST_BINDING_MISMATCH",
  });
});

test("HOLD on evidence BUS identity mismatch", () => {
  const result = admitBusKiraWakeGatewayDispatch({
    request,
    dispatch: dispatch({
      evidence: { bus_identity: { ...busIdentity, stateRevision: 8 } },
    }),
  });
  assert.deepEqual(result, {
    status: "HOLD",
    reason: "BUS_IDENTITY_HOLD",
    detail: "EVIDENCE_BINDING_MISMATCH",
  });
});

test("HOLD when dispatch is not RUNNING", () => {
  const result = admitBusKiraWakeGatewayDispatch({ request, dispatch: dispatch({ status: "READY" }) });
  assert.deepEqual(result, { status: "HOLD", reason: "POST_PERMIT_BINDING_CHANGED" });
});
