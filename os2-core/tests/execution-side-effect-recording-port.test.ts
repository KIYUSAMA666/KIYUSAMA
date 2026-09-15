import assert from "node:assert/strict";
import test from "node:test";

import { markExecutionSideEffect } from "../src/execution-side-effect-recording-port.js";

const REQUIRED_RPC_KEYS = [
  "p_task_id",
  "p_execution_id",
  "p_authority_token",
  "p_status",
  "p_result",
  "p_evidence",
] as const;

function validInput() {
  return {
    taskId: "11111111-1111-4111-8111-111111111111",
    executionId: "22222222-2222-4222-8222-222222222222",
    authorityToken: "33333333-3333-4333-8333-333333333333",
    status: "STARTED" as const,
    result: { external_write_started: true },
    evidence: { source: "bus-kira-wake" },
  };
}

function assertProductionSignature(args: Record<string, unknown>): void {
  assert.deepEqual(Object.keys(args).sort(), [...REQUIRED_RPC_KEYS].sort());
  for (const key of ["p_task_id", "p_execution_id", "p_authority_token", "p_status"] as const) {
    assert.equal(typeof args[key], "string");
    assert.notEqual((args[key] as string).trim(), "");
  }
}

test("passes the production execution_gate_mark_side_effect_v0 named arguments exactly", async () => {
  let observedName = "";
  let observedArgs: Record<string, unknown> | null = null;
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      observedName = name;
      observedArgs = args;
      assertProductionSignature(args);
      return { data: null, error: null };
    },
  };

  const decision = await markExecutionSideEffect(client, validInput());
  assert.deepEqual(decision, { status: "RECORDED" });
  assert.equal(observedName, "execution_gate_mark_side_effect_v0");
  assert.deepEqual(observedArgs, {
    p_task_id: "11111111-1111-4111-8111-111111111111",
    p_execution_id: "22222222-2222-4222-8222-222222222222",
    p_authority_token: "33333333-3333-4333-8333-333333333333",
    p_status: "STARTED",
    p_result: { external_write_started: true },
    p_evidence: { source: "bus-kira-wake" },
  });
});

test("accepts only existing STARTED UNKNOWN CONFIRMED statuses", async () => {
  for (const status of ["STARTED", "UNKNOWN", "CONFIRMED"] as const) {
    const decision = await markExecutionSideEffect(
      { async rpc(_name, args) { assertProductionSignature(args); return { data: null, error: null }; } },
      { ...validInput(), status },
    );
    assert.deepEqual(decision, { status: "RECORDED" });
  }
});

test("fails closed before RPC when required task binding is absent", async () => {
  let calls = 0;
  const decision = await markExecutionSideEffect(
    { async rpc() { calls += 1; return { data: null, error: null }; } },
    { ...validInput(), taskId: "" },
  );
  assert.deepEqual(decision, { status: "HOLD", reason: "INVALID_INPUT" });
  assert.equal(calls, 0);
});

test("fails closed before RPC on unsupported status", async () => {
  let calls = 0;
  const decision = await markExecutionSideEffect(
    { async rpc() { calls += 1; return { data: null, error: null }; } },
    { ...validInput(), status: "DONE" as never },
  );
  assert.deepEqual(decision, { status: "HOLD", reason: "INVALID_INPUT" });
  assert.equal(calls, 0);
});

test("fails closed on RPC error", async () => {
  const decision = await markExecutionSideEffect(
    { async rpc(_name, args) { assertProductionSignature(args); return { data: null, error: { message: "denied" } }; } },
    validInput(),
  );
  assert.deepEqual(decision, { status: "HOLD", reason: "RPC_ERROR" });
});

test("fails closed when RPC throws", async () => {
  const decision = await markExecutionSideEffect(
    { async rpc(_name, args) { assertProductionSignature(args); throw new Error("network"); } },
    validInput(),
  );
  assert.deepEqual(decision, { status: "HOLD", reason: "RPC_ERROR" });
});
