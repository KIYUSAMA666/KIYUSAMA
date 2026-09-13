import {
  deliverBusMessage,
  publishBusMessage,
  type BusDeliveryRecord,
  type BusMessage,
} from "./ai-communication-bus-core.js";
import {
  slackSendResultToEvidence,
  type SlackSendResult,
} from "./ai-communication-bus-slack-adapter.js";
import {
  bindManagedWakeEnqueue,
  bindManagedWakeExecutorResult,
  type ManagedWakeEnqueueReceipt,
  type ManagedWakeExecutorReceipt,
} from "./ai-communication-bus-live-kira-adapter.js";
import type { TransportEvidence } from "./ai-communication-bus-transport-evidence.js";
import type { KiraWakeBridgeRecord } from "./ai-communication-bus-kira-wake-bridge.js";

export interface LiveBusPersistenceReceipt {
  ok: boolean;
  storedMessageId?: string;
  storedTraceId?: string;
  storedProviderDeliveryId?: string;
}

export interface LiveBusInvocationPorts {
  persistBusAndTransport(input: {
    message: BusMessage;
    evidence: TransportEvidence;
    delivery: BusDeliveryRecord;
  }): Promise<LiveBusPersistenceReceipt>;
  enqueueManagedWake(delivery: BusDeliveryRecord): Promise<ManagedWakeEnqueueReceipt>;
  executeManagedWake(wakeMessageId: string): Promise<ManagedWakeExecutorReceipt>;
}

export type LiveBusInvocationDecision =
  | {
      status: "CONFIRMED";
      message: BusMessage;
      evidence: TransportEvidence;
      delivery: BusDeliveryRecord;
      wake: KiraWakeBridgeRecord;
    }
  | {
      status: "UNKNOWN";
      stage: "SLACK_EVIDENCE" | "WAKE_EXECUTION";
      reason: string;
    }
  | {
      status: "HOLD";
      stage:
        | "BUS_MESSAGE"
        | "SLACK_EVIDENCE"
        | "DELIVERY"
        | "PERSISTENCE"
        | "WAKE_ENQUEUE"
        | "WAKE_EXECUTION";
      reason: string;
    };

function exactPersistenceBinding(
  receipt: LiveBusPersistenceReceipt,
  message: BusMessage,
  evidence: TransportEvidence,
): boolean {
  return (
    receipt.ok === true &&
    receipt.storedMessageId === message.messageId &&
    receipt.storedTraceId === message.traceId &&
    receipt.storedProviderDeliveryId === evidence.providerDeliveryId
  );
}

export async function runLiveBusInvocation(input: {
  message: BusMessage;
  expectedSlackChannelId: string;
  slackSendResult: Partial<SlackSendResult> | null | undefined;
  slackObservedAt: string;
  wakeEnqueueObservedAt: string;
  wakeExecutionObservedAt: string;
  ports: LiveBusInvocationPorts;
}): Promise<LiveBusInvocationDecision> {
  const published = publishBusMessage(null, input.message);
  if (published.status === "HOLD") {
    return { status: "HOLD", stage: "BUS_MESSAGE", reason: published.reason };
  }

  const slackEvidence = slackSendResultToEvidence({
    message: published.value.message,
    expectedChannelId: input.expectedSlackChannelId,
    sendResult: input.slackSendResult,
    observedAt: input.slackObservedAt,
  });
  if (slackEvidence.status === "UNKNOWN") {
    return { status: "UNKNOWN", stage: "SLACK_EVIDENCE", reason: slackEvidence.reason };
  }
  if (slackEvidence.status === "HOLD") {
    return { status: "HOLD", stage: "SLACK_EVIDENCE", reason: slackEvidence.reason };
  }

  if (
    slackEvidence.evidence.messageId !== published.value.message.messageId ||
    slackEvidence.evidence.traceId !== published.value.message.traceId ||
    slackEvidence.evidence.targetAgentId !== published.value.message.targetAgentId ||
    slackEvidence.evidence.status !== "DELIVERED"
  ) {
    return { status: "HOLD", stage: "SLACK_EVIDENCE", reason: "TRANSPORT_BINDING_MISMATCH" };
  }

  const delivered = deliverBusMessage(published.value, published.value.message.targetAgentId);
  if (delivered.status === "HOLD") {
    return { status: "HOLD", stage: "DELIVERY", reason: delivered.reason };
  }

  const persistence = await input.ports.persistBusAndTransport({
    message: published.value.message,
    evidence: slackEvidence.evidence,
    delivery: delivered.value,
  });
  if (!exactPersistenceBinding(persistence, published.value.message, slackEvidence.evidence)) {
    return { status: "HOLD", stage: "PERSISTENCE", reason: "PERSISTENCE_BINDING_MISMATCH" };
  }

  const enqueueReceipt = await input.ports.enqueueManagedWake(delivered.value);
  const wakeBound = bindManagedWakeEnqueue(
    delivered.value,
    null,
    enqueueReceipt,
    input.wakeEnqueueObservedAt,
  );
  if (wakeBound.status === "HOLD") {
    return { status: "HOLD", stage: "WAKE_ENQUEUE", reason: wakeBound.reason };
  }

  if (wakeBound.value.wakeMessageId === null) {
    return { status: "HOLD", stage: "WAKE_ENQUEUE", reason: "MISSING_WAKE_MESSAGE_ID" };
  }

  const executorReceipt = await input.ports.executeManagedWake(wakeBound.value.wakeMessageId);
  const wakeResult = bindManagedWakeExecutorResult(
    wakeBound.value,
    executorReceipt,
    input.wakeExecutionObservedAt,
  );
  if (wakeResult.status === "UNKNOWN") {
    return { status: "UNKNOWN", stage: "WAKE_EXECUTION", reason: "WAKE_EXECUTION_AMBIGUOUS" };
  }
  if (wakeResult.status === "HOLD") {
    return { status: "HOLD", stage: "WAKE_EXECUTION", reason: wakeResult.reason };
  }
  if (wakeResult.value.status !== "CONFIRMED") {
    return { status: "HOLD", stage: "WAKE_EXECUTION", reason: "WAKE_NOT_CONFIRMED" };
  }

  return {
    status: "CONFIRMED",
    message: structuredClone(published.value.message),
    evidence: structuredClone(slackEvidence.evidence),
    delivery: structuredClone(delivered.value),
    wake: structuredClone(wakeResult.value),
  };
}
