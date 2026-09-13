import type { BusMessage } from "./ai-communication-bus-core.js";
import type { TransportEvidence } from "./ai-communication-bus-transport-evidence.js";

export interface SlackSendResult {
  channelId: string;
  messageTs: string;
  messageLink: string;
}

export type SlackAdapterDecision =
  | { status: "EVIDENCE"; evidence: TransportEvidence }
  | { status: "UNKNOWN"; reason: "SLACK_SEND_RESULT_AMBIGUOUS" }
  | { status: "HOLD"; reason: "SLACK_CHANNEL_MISMATCH" | "INVALID_SLACK_SEND_RESULT" };

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validSlackTs(value: unknown): value is string {
  return nonEmpty(value) && /^\d+\.\d+$/.test(value);
}

function validSlackMessageLink(value: unknown): value is string {
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("slack.com");
  } catch {
    return false;
  }
}

export function createSlackOutboundText(message: BusMessage): string {
  return JSON.stringify({
    messageId: message.messageId,
    traceId: message.traceId,
    sourceAgentId: message.sourceAgentId,
    targetAgentId: message.targetAgentId,
    kind: message.kind,
    parentMessageId: message.parentMessageId,
    current: message.current,
    payload: message.payload,
  });
}

export function slackSendResultToEvidence(input: {
  message: BusMessage;
  expectedChannelId: string;
  sendResult: Partial<SlackSendResult> | null | undefined;
  observedAt: string;
}): SlackAdapterDecision {
  const { message, expectedChannelId, sendResult, observedAt } = input;

  if (!nonEmpty(expectedChannelId) || !nonEmpty(observedAt) || !Number.isFinite(Date.parse(observedAt))) {
    return { status: "HOLD", reason: "INVALID_SLACK_SEND_RESULT" };
  }

  if (sendResult === null || sendResult === undefined) {
    return { status: "UNKNOWN", reason: "SLACK_SEND_RESULT_AMBIGUOUS" };
  }

  if (!nonEmpty(sendResult.channelId) || !validSlackTs(sendResult.messageTs) || !validSlackMessageLink(sendResult.messageLink)) {
    return { status: "HOLD", reason: "INVALID_SLACK_SEND_RESULT" };
  }

  if (sendResult.channelId !== expectedChannelId) {
    return { status: "HOLD", reason: "SLACK_CHANNEL_MISMATCH" };
  }

  return {
    status: "EVIDENCE",
    evidence: {
      provider: "SLACK",
      providerDeliveryId: sendResult.messageTs,
      messageId: message.messageId,
      traceId: message.traceId,
      targetAgentId: message.targetAgentId,
      observedAt,
      status: "DELIVERED",
    },
  };
}
