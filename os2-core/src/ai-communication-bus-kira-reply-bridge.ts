import { createBusReply, type BusMessage } from "./ai-communication-bus-core.js";
import { verifyBusRoundTripEvidence, type BusRoundTripDecision } from "./ai-communication-bus-round-trip-evidence.js";
import type { ManagedWakeExecutorReceipt } from "./ai-communication-bus-live-kira-adapter.js";
import type { TransportEvidence } from "./ai-communication-bus-transport-evidence.js";

export interface GenuineKiraReplyRecord {
  messageId: string;
  traceId: string;
  parentMessageId: string;
  sourceAgentId: string;
  targetAgentId: string;
  stateId: string;
  stateRevision: number;
  createdAt: string;
  payload: unknown;
  provider: string;
  providerDeliveryId: string;
  observedAt: string;
}

export type KiraReplyBridgeDecision =
  | { status: "VERIFIED"; reply: BusMessage; transport: TransportEvidence; roundTrip: BusRoundTripDecision & { status: "VERIFIED" } }
  | { status: "HOLD"; reason: string };

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function exactExecutorReplyId(receipt: ManagedWakeExecutorReceipt): string | null {
  if (!receipt.ok || !receipt.trace_authentication) return null;
  const trace = receipt.trace_authentication;
  if (
    trace.device_model !== "KIRA-BC" ||
    trace.executed_function !== "kira-managed-wake-executor-v1" ||
    !nonEmpty(trace.reply_message_id)
  ) return null;
  return trace.reply_message_id;
}

export function bridgeGenuineKiraReply(input: {
  request: BusMessage;
  requestTransport: TransportEvidence;
  executorReceipt: ManagedWakeExecutorReceipt;
  genuineReply: GenuineKiraReplyRecord;
}): KiraReplyBridgeDecision {
  const executorReplyId = exactExecutorReplyId(input.executorReceipt);
  if (executorReplyId === null) return { status: "HOLD", reason: "INVALID_EXECUTOR_REPLY_EVIDENCE" };
  if (executorReplyId !== input.genuineReply.messageId) return { status: "HOLD", reason: "EXECUTOR_REPLY_ID_MISMATCH" };

  const reply: BusMessage = {
    messageId: input.genuineReply.messageId,
    traceId: input.genuineReply.traceId,
    kind: "REPLY",
    sourceAgentId: input.genuineReply.sourceAgentId,
    targetAgentId: input.genuineReply.targetAgentId,
    parentMessageId: input.genuineReply.parentMessageId,
    current: {
      stateId: input.genuineReply.stateId,
      stateRevision: input.genuineReply.stateRevision,
    },
    createdAt: input.genuineReply.createdAt,
    payload: structuredClone(input.genuineReply.payload),
  };

  const replyDecision = createBusReply(input.request, reply);
  if (replyDecision.status === "HOLD") return { status: "HOLD", reason: replyDecision.reason };

  const transport: TransportEvidence = {
    provider: input.genuineReply.provider,
    providerDeliveryId: input.genuineReply.providerDeliveryId,
    messageId: replyDecision.value.messageId,
    traceId: replyDecision.value.traceId,
    targetAgentId: replyDecision.value.targetAgentId,
    observedAt: input.genuineReply.observedAt,
    status: "DELIVERED",
  };

  const roundTrip = verifyBusRoundTripEvidence({
    request: input.request,
    requestTransport: input.requestTransport,
    reply: replyDecision.value,
    replyTransport: transport,
  });
  if (roundTrip.status === "HOLD") return roundTrip;

  return { status: "VERIFIED", reply: replyDecision.value, transport, roundTrip };
}
