import assert from "node:assert/strict";
import test from "node:test";

import { markExecutionSideEffect } from "../src/execution-side-effect-recording-port.js";

function validInput() {
  return {
    dispatchId: "dispatch-1",
    executionId: "execution-1",
    workerId: "worker-1",
    workerEpoch: 7,
    authorityToken: "authority-token-1",
    sideEffectStatus: "STARTED" as const,
    result: { external_write_started: true },
    evidence: { dispatch_id: "dispatch-1" },
  };
}

test("passes the existing execution_v0 RPC vocabulary without BUS-specific remapping", async () => {
  let observedName = "";
  let observedArgs: Record<string, unknown> | null = null;
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      observedName = name;
      observedArgs = args;
      return { data: { ok: true }, error: null };
    },
  };

  const decision = await markExecutionSideEffect(client, validInput());
  assert.equal(decision.status, "RECORDED");
  assert.equal(observedName, "execution_gate_mark_side_effect_v0");
  assert.deepEqual(observedArgs, {
    p_dispatch_id: "dispatch-1",
    p_execution_id: "execution-1",
    p_worker_id: "worker-1",
    p_worker_epoch: 7,
    p_authority_token: "authority-token-1",
    p_side_effect_status: "STARTED",
    p_result: { external_write_started: true },
    p_evidence: { dispatch_id: "dispatch-1" },
  });
});

test("accepts only existing STARTED UNKNOWN CONFIRMED statuses", async () => {
  for (const status of ["STARTED", "UNKNOWN", "CONFIRMED"] as const) {
    const decision = await markExecutionSideEffect(
      { async rpc() { return { data: { ok: true }, error: null }; } },
      { ...validInput(), sideEffectStatus: status },
    );
    assert.equal(decision.status, "RECORDED");
  }
});

test("fails closed before RPC on malformed binding", async () => {
  let calls = 0;
  const decision = await markExecutionSideEffect(
    { async rpc() { calls += 1; return { data: null, error: null }; } },
    { ...validInput(), workerEpoch: 0 },
  );
  assert.deepEqual(decision, { status: "HOLD", reason: "INVALID_INPUT" });
  assert.equal(calls, 0);
});

test("fails closed on RPC error", async () => {
  const decision = await markExecutionSideEffect(
    { async rpc() { return { data: null, error: { message: "denied" } }; } },
    validInput(),
  );
  assert.deepEqual(decision, { status: "HOLD", reason: "RPC_ERROR" });
});

test("fails closed when RPC throws", async () => {
  const decision = await markExecutionSideEffect(
    { async rpc() { throw new Error("network"); } },
    validInput(),
  );
  assert.deepEqual(decision, { status: "HOLD", reason: "RPC_ERROR" });
});
