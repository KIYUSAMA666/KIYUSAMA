import type { BusMessage } from "./ai-communication-bus-core.js";
import type { TransportEvidence } from "./ai-communication-bus-transport-evidence.js";

export interface BusRoundTripEvidence {
  request: BusMessage;
  requestTransport: TransportEvidence;
  reply: BusMessage;
  replyTransport: TransportEvidence;
}

export type BusRoundTripDecision =
  | { status: "VERIFIED"; evidence: BusRoundTripEvidence }
  | { status: "HOLD"; reason: BusRoundTripHoldReason };

export type BusRoundTripHoldReason =
  | "INVALID_REQUEST_KIND"
  | "INVALID_REPLY_KIND"
  | "REQUEST_TRANSPORT_NOT_DELIVERED"
  | "REPLY_TRANSPORT_NOT_DELIVERED"
  | "REQUEST_BINDING_MISMATCH"
  | "REPLY_BINDING_MISMATCH"
  | "TRACE_MISMATCH"
  | "PARENT_MISMATCH"
  | "ROUTE_MISMATCH"
  | "CURRENT_BINDING_MISMATCH";

function exactTransportBinding(message: BusMessage, evidence: TransportEvidence): boolean {
  return (
    evidence.status === "DELIVERED" &&
    evidence.providerDeliveryId !== null &&
    evidence.providerDeliveryId.trim().length > 0 &&
    evidence.messageId === message.messageId &&
    evidence.traceId === message.traceId &&
    evidence.targetAgentId === message.targetAgentId
  );
}

export function verifyBusRoundTripEvidence(
  evidence: BusRoundTripEvidence,
): BusRoundTripDecision {
  const { request, requestTransport, reply, replyTransport } = evidence;

  if (request.kind !== "MESSAGE" || request.parentMessageId !== null) {
    return { status: "HOLD", reason: "INVALID_REQUEST_KIND" };
  }
  if (reply.kind !== "REPLY") {
    return { status: "HOLD", reason: "INVALID_REPLY_KIND" };
  }

  if (requestTransport.status !== "DELIVERED") {
    return { status: "HOLD", reason: "REQUEST_TRANSPORT_NOT_DELIVERED" };
  }
  if (replyTransport.status !== "DELIVERED") {
    return { status: "HOLD", reason: "REPLY_TRANSPORT_NOT_DELIVERED" };
  }

  if (!exactTransportBinding(request, requestTransport)) {
    return { status: "HOLD", reason: "REQUEST_BINDING_MISMATCH" };
  }
  if (!exactTransportBinding(reply, replyTransport)) {
    return { status: "HOLD", reason: "REPLY_BINDING_MISMATCH" };
  }

  if (reply.traceId !== request.traceId) {
    return { status: "HOLD", reason: "TRACE_MISMATCH" };
  }
  if (reply.parentMessageId !== request.messageId) {
    return { status: "HOLD", reason: "PARENT_MISMATCH" };
  }
  if (
    reply.sourceAgentId !== request.targetAgentId ||
    reply.targetAgentId !== request.sourceAgentId
  ) {
    return { status: "HOLD", reason: "ROUTE_MISMATCH" };
  }

  if (
    reply.current.stateId !== request.current.stateId ||
    reply.current.stateRevision < request.current.stateRevision
  ) {
    return { status: "HOLD", reason: "CURRENT_BINDING_MISMATCH" };
  }

  return { status: "VERIFIED", evidence: structuredClone(evidence) };
}
