import type { DurableBusRecord } from "./ai-communication-bus-durable-state.js";

export type TransportEvidenceStatus = "DELIVERED" | "AMBIGUOUS" | "REJECTED";

export interface TransportEvidence {
  provider: string;
  providerDeliveryId: string | null;
  messageId: string;
  traceId: string;
  targetAgentId: string;
  observedAt: string;
  status: TransportEvidenceStatus;
}

export type TransportEvidenceDecision =
  | { status: "DELIVERED"; evidence: TransportEvidence }
  | { status: "UNKNOWN"; reason: "AMBIGUOUS_TRANSPORT_OUTCOME"; evidence: TransportEvidence }
  | { status: "HOLD"; reason: TransportEvidenceHoldReason };

export type TransportEvidenceHoldReason =
  | "INVALID_EVIDENCE"
  | "MESSAGE_BINDING_MISMATCH"
  | "TARGET_BINDING_MISMATCH"
  | "TRACE_BINDING_MISMATCH"
  | "INVALID_SOURCE_STATE"
  | "PROVIDER_REJECTED";

function validNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return validNonEmpty(value) && Number.isFinite(Date.parse(value));
}

export function evaluateTransportEvidence(
  record: DurableBusRecord,
  evidence: TransportEvidence,
): TransportEvidenceDecision {
  if (
    !validNonEmpty(evidence.provider) ||
    !(evidence.providerDeliveryId === null || validNonEmpty(evidence.providerDeliveryId)) ||
    !validNonEmpty(evidence.messageId) ||
    !validNonEmpty(evidence.traceId) ||
    !validNonEmpty(evidence.targetAgentId) ||
    !validTimestamp(evidence.observedAt) ||
    !(["DELIVERED", "AMBIGUOUS", "REJECTED"] as const).includes(evidence.status)
  ) {
    return { status: "HOLD", reason: "INVALID_EVIDENCE" };
  }

  if (record.status !== "PENDING" && record.status !== "UNKNOWN") {
    return { status: "HOLD", reason: "INVALID_SOURCE_STATE" };
  }

  if (evidence.messageId !== record.message.messageId) {
    return { status: "HOLD", reason: "MESSAGE_BINDING_MISMATCH" };
  }
  if (evidence.traceId !== record.message.traceId) {
    return { status: "HOLD", reason: "TRACE_BINDING_MISMATCH" };
  }
  if (evidence.targetAgentId !== record.message.targetAgentId) {
    return { status: "HOLD", reason: "TARGET_BINDING_MISMATCH" };
  }

  if (evidence.status === "REJECTED") {
    return { status: "HOLD", reason: "PROVIDER_REJECTED" };
  }

  if (evidence.status === "AMBIGUOUS") {
    return {
      status: "UNKNOWN",
      reason: "AMBIGUOUS_TRANSPORT_OUTCOME",
      evidence: structuredClone(evidence),
    };
  }

  if (!validNonEmpty(evidence.providerDeliveryId)) {
    return { status: "HOLD", reason: "INVALID_EVIDENCE" };
  }

  return { status: "DELIVERED", evidence: structuredClone(evidence) };
}
