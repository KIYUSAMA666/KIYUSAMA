import test from "node:test";
import assert from "node:assert/strict";
import type { BusMessage } from "../src/ai-communication-bus-core.js";
import {
  busMessageToExecutionV0Identity,
  EXECUTION_V0_BUS_IDENTITY_KEY,
  verifyExecutionV0BusIdentityBinding,
} from "../src/execution-v0-bus-identity-bridge.js";

const message: BusMessage = {
  messageId: "69e406da-9c3c-4857-a701-3e1c038acbf8",
  traceId: "2ac5ee43-f8f6-4cd1-a945-60fa31a471f6",
  kind: "MESSAGE",
  sourceAgentId: "SORA",
  targetAgentId: "KIRA",
  parentMessageId: null,
  current: { stateId: "room-v1", stateRevision: 7 },
  createdAt: "2026-09-14T08:00:00Z",
  payload: { instruction: "audit" },
};

function binding() {
  return {
    messageId: message.messageId,
    traceId: message.traceId,
    stateId: message.current.stateId,
    stateRevision: message.current.stateRevision,
  };
}

function containers(): {
  requestPayload: Record<string, unknown>;
  evidence: Record<string, unknown>;
} {
  return {
    requestPayload: {
      path: "legacy-field-remains-intact",
      [EXECUTION_V0_BUS_IDENTITY_KEY]: binding(),
    },
    evidence: {
      worker_id: "LEGACY-WORKER",
      [EXECUTION_V0_BUS_IDENTITY_KEY]: binding(),
    },
  };
}

function mutableBinding(container: Record<string, unknown>): Record<string, unknown> {
  return container[EXECUTION_V0_BUS_IDENTITY_KEY] as Record<string, unknown>;
}

test("1 exact BUS identity in both existing JSON containers passes", () => {
  const c = containers();
  assert.deepEqual(
    verifyExecutionV0BusIdentityBinding({ message, ...c }),
    { status: "PASS", binding: binding() },
  );
});

test("2 existing unrelated request_payload/evidence keys are tolerated", () => {
  const c = containers();
  c.requestPayload.branch = "test/permission-check";
  c.evidence.claim_mode = "ATOMIC_READY_TO_RUNNING";
  assert.equal(verifyExecutionV0BusIdentityBinding({ message, ...c }).status, "PASS");
});

test("3 missing request binding fails closed", () => {
  const c = containers();
  delete c.requestPayload[EXECUTION_V0_BUS_IDENTITY_KEY];
  assert.deepEqual(verifyExecutionV0BusIdentityBinding({ message, ...c }), {
    status: "HOLD",
    reason: "BUS_IDENTITY_MISSING",
  });
});

test("4 missing evidence binding fails closed", () => {
  const c = containers();
  delete c.evidence[EXECUTION_V0_BUS_IDENTITY_KEY];
  assert.deepEqual(verifyExecutionV0BusIdentityBinding({ message, ...c }), {
    status: "HOLD",
    reason: "BUS_IDENTITY_MISSING",
  });
});

test("5 messageId substitution in request_payload is rejected", () => {
  const c = containers();
  mutableBinding(c.requestPayload).messageId = "ATTACK";
  assert.deepEqual(verifyExecutionV0BusIdentityBinding({ message, ...c }), {
    status: "HOLD",
    reason: "REQUEST_BINDING_MISMATCH",
  });
});

test("6 traceId substitution in evidence is rejected", () => {
  const c = containers();
  mutableBinding(c.evidence).traceId = "ATTACK";
  assert.deepEqual(verifyExecutionV0BusIdentityBinding({ message, ...c }), {
    status: "HOLD",
    reason: "EVIDENCE_BINDING_MISMATCH",
  });
});

test("7 stateId substitution is rejected", () => {
  const c = containers();
  mutableBinding(c.requestPayload).stateId = "OTHER-STATE";
  assert.deepEqual(verifyExecutionV0BusIdentityBinding({ message, ...c }), {
    status: "HOLD",
    reason: "REQUEST_BINDING_MISMATCH",
  });
});

test("8 stateRevision substitution is rejected", () => {
  const c = containers();
  mutableBinding(c.evidence).stateRevision = 8;
  assert.deepEqual(verifyExecutionV0BusIdentityBinding({ message, ...c }), {
    status: "HOLD",
    reason: "EVIDENCE_BINDING_MISMATCH",
  });
});

test("9 malformed or extra-key identity is rejected", () => {
  const c = containers();
  c.requestPayload[EXECUTION_V0_BUS_IDENTITY_KEY] = {
    ...binding(),
    authority: "FORGED",
  };
  assert.deepEqual(verifyExecutionV0BusIdentityBinding({ message, ...c }), {
    status: "HOLD",
    reason: "BUS_IDENTITY_INVALID",
  });
});

test("10 non-object execution_v0 containers are rejected", () => {
  assert.deepEqual(
    verifyExecutionV0BusIdentityBinding({ message, requestPayload: null, evidence: {} }),
    { status: "HOLD", reason: "INVALID_CONTAINER" },
  );
});

test("11 binding constructor copies only BUS identity fields", () => {
  assert.deepEqual(busMessageToExecutionV0Identity(message), binding());
  assert.equal(Object.isFrozen(busMessageToExecutionV0Identity(message)), true);
});
