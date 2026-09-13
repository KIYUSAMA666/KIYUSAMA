import assert from "node:assert/strict";
import test from "node:test";
import type { BusMessage } from "../src/ai-communication-bus-core.js";
import {
  runLiveBusInvocation,
  type LiveBusInvocationPorts,
} from "../src/ai-communication-bus-live-invocation-orchestrator.js";

const message: BusMessage = {
  messageId: "bus-live-orchestrator-01",
  traceId: "trace-live-orchestrator-01",
  kind: "MESSAGE",
  sourceAgentId: "SORA",
  targetAgentId: "KIRA",
  parentMessageId: null,
  current: { stateId: "room-v1", stateRevision: 7 },
  createdAt: "2026-09-13T12:00:00Z",
  payload: { type: "LIVE_BUS_INVOCATION_TEST" },
};

const wakeId = "259c01c3-8c82-47ee-affc-6aa2b1254735";
const replyId = "d2705df9-0e52-44e0-bfec-db2e2a87551d";

function exactPorts(events: string[]): LiveBusInvocationPorts {
  return {
    async persistBusAndTransport(input) {
      events.push("persist");
      return {
        ok: true,
        storedMessageId: input.message.messageId,
        storedTraceId: input.message.traceId,
        storedProviderDeliveryId: input.evidence.providerDeliveryId ?? undefined,
      };
    },
    async enqueueManagedWake() {
      events.push("enqueue");
      return {
        ok: true,
        message_id: wakeId,
        status: "NEW",
        trust_class: "AUTHENTICATED_INTERNAL",
        instruction_scope: "MANAGED_WAKE",
      };
    },
    async executeManagedWake(id) {
      events.push(`execute:${id}`);
      return {
        ok: true,
        trace_authentication: {
          device_model: "KIRA-BC",
          executed_function: "kira-managed-wake-executor-v1",
          message_id: wakeId,
          receiver_execution_id: "exec-1",
          agent_id: "agent-1",
          environment_id: "env-1",
          reply_message_id: replyId,
          deployment_run_id: "run-1",
          session_id: "session-1",
        },
      };
    },
  };
}

function baseInput(ports: LiveBusInvocationPorts) {
  return {
    message,
    expectedSlackChannelId: "C0BLC7U76FR",
    slackSendResult: {
      channelId: "C0BLC7U76FR",
      messageTs: "1789302184.338689",
      messageLink: "https://kiyusama.slack.com/archives/C0BLC7U76FR/p1789302184338689",
    },
    slackObservedAt: "2026-09-13T12:00:01Z",
    wakeEnqueueObservedAt: "2026-09-13T12:00:02Z",
    wakeExecutionObservedAt: "2026-09-13T12:00:03Z",
    ports,
  };
}

test("runs exact persistence -> enqueue -> executor sequence and confirms", async () => {
  const events: string[] = [];
  const decision = await runLiveBusInvocation(baseInput(exactPorts(events)));
  assert.equal(decision.status, "CONFIRMED");
  assert.deepEqual(events, ["persist", "enqueue", `execute:${wakeId}`]);
  if (decision.status !== "CONFIRMED") assert.fail("expected CONFIRMED");
  assert.equal(decision.evidence.providerDeliveryId, "1789302184.338689");
  assert.equal(decision.wake.status, "CONFIRMED");
});

test("ambiguous Slack result stops before all external ports", async () => {
  const events: string[] = [];
  const input = baseInput(exactPorts(events));
  const decision = await runLiveBusInvocation({ ...input, slackSendResult: null });
  assert.deepEqual(decision, {
    status: "UNKNOWN",
    stage: "SLACK_EVIDENCE",
    reason: "SLACK_SEND_RESULT_AMBIGUOUS",
  });
  assert.deepEqual(events, []);
});

test("wrong Slack channel fails closed before persistence", async () => {
  const events: string[] = [];
  const input = baseInput(exactPorts(events));
  const decision = await runLiveBusInvocation({
    ...input,
    slackSendResult: { ...input.slackSendResult, channelId: "C-WRONG" },
  });
  assert.deepEqual(decision, {
    status: "HOLD",
    stage: "SLACK_EVIDENCE",
    reason: "SLACK_CHANNEL_MISMATCH",
  });
  assert.deepEqual(events, []);
});

test("invalid root MESSAGE fails before transport handling", async () => {
  const events: string[] = [];
  const input = baseInput(exactPorts(events));
  const decision = await runLiveBusInvocation({
    ...input,
    message: { ...message, parentMessageId: "forged-parent" },
  });
  assert.deepEqual(decision, {
    status: "HOLD",
    stage: "BUS_MESSAGE",
    reason: "INVALID_MESSAGE",
  });
  assert.deepEqual(events, []);
});

test("persistence binding mismatch prevents wake enqueue", async () => {
  const events: string[] = [];
  const ports = exactPorts(events);
  ports.persistBusAndTransport = async () => {
    events.push("persist");
    return {
      ok: true,
      storedMessageId: "other-message",
      storedTraceId: message.traceId,
      storedProviderDeliveryId: "1789302184.338689",
    };
  };
  const decision = await runLiveBusInvocation(baseInput(ports));
  assert.deepEqual(decision, {
    status: "HOLD",
    stage: "PERSISTENCE",
    reason: "PERSISTENCE_BINDING_MISMATCH",
  });
  assert.deepEqual(events, ["persist"]);
});

test("forged MANAGED_WAKE enqueue receipt prevents executor call", async () => {
  const events: string[] = [];
  const ports = exactPorts(events);
  ports.enqueueManagedWake = async () => {
    events.push("enqueue");
    return {
      ok: true,
      message_id: "not-a-uuid",
      status: "NEW",
      trust_class: "AUTHENTICATED_INTERNAL",
      instruction_scope: "MANAGED_WAKE",
    };
  };
  const decision = await runLiveBusInvocation(baseInput(ports));
  assert.deepEqual(decision, {
    status: "HOLD",
    stage: "WAKE_ENQUEUE",
    reason: "INVALID_WAKE_EVIDENCE",
  });
  assert.deepEqual(events, ["persist", "enqueue"]);
});

test("ambiguous executor result remains UNKNOWN", async () => {
  const events: string[] = [];
  const ports = exactPorts(events);
  ports.executeManagedWake = async (id) => {
    events.push(`execute:${id}`);
    return { ok: false, error: "MANAGED_SESSION_BUSY" };
  };
  const decision = await runLiveBusInvocation(baseInput(ports));
  assert.deepEqual(decision, {
    status: "UNKNOWN",
    stage: "WAKE_EXECUTION",
    reason: "WAKE_EXECUTION_AMBIGUOUS",
  });
  assert.deepEqual(events, ["persist", "enqueue", `execute:${wakeId}`]);
});

test("forged executor identity fails closed", async () => {
  const events: string[] = [];
  const ports = exactPorts(events);
  ports.executeManagedWake = async (id) => {
    events.push(`execute:${id}`);
    return {
      ok: true,
      trace_authentication: {
        device_model: "OTHER",
        executed_function: "kira-managed-wake-executor-v1",
        message_id: wakeId,
        receiver_execution_id: "exec-1",
        agent_id: "agent-1",
        environment_id: "env-1",
        reply_message_id: replyId,
        deployment_run_id: "run-1",
        session_id: "session-1",
      },
    };
  };
  const decision = await runLiveBusInvocation(baseInput(ports));
  assert.deepEqual(decision, {
    status: "HOLD",
    stage: "WAKE_EXECUTION",
    reason: "INVALID_WAKE_EVIDENCE",
  });
});
