export type RelayPhase = "REQUEST" | "RESPONSE";

export interface RelayEnvelope<T = unknown> {
  messageId: string;
  correlationId: string;
  phase: RelayPhase;
  from: string;
  to: string;
  payload: T;
  evidenceRefs: readonly string[];
}

export type RelayDecision<T = unknown> =
  | { status: "ACCEPT"; envelope: RelayEnvelope<T> }
  | { status: "REJECT"; reason: "SELF_ROUTE" | "CORRELATION_MISMATCH" | "INVALID_PHASE" };

export function acceptInbound<T>(envelope: RelayEnvelope<T>): RelayDecision<T> {
  if (envelope.from === envelope.to) {
    return { status: "REJECT", reason: "SELF_ROUTE" };
  }
  if (envelope.phase !== "REQUEST" && envelope.phase !== "RESPONSE") {
    return { status: "REJECT", reason: "INVALID_PHASE" };
  }
  return { status: "ACCEPT", envelope };
}

export function createResponse<TRequest, TResponse>(
  request: RelayEnvelope<TRequest>,
  messageId: string,
  payload: TResponse,
  evidenceRefs: readonly string[] = [],
): RelayEnvelope<TResponse> {
  if (request.phase !== "REQUEST") {
    throw new Error("response requires REQUEST envelope");
  }
  return {
    messageId,
    correlationId: request.correlationId,
    phase: "RESPONSE",
    from: request.to,
    to: request.from,
    payload,
    evidenceRefs,
  };
}

export function verifyRoundTrip<TRequest, TResponse>(
  request: RelayEnvelope<TRequest>,
  response: RelayEnvelope<TResponse>,
): RelayDecision<TResponse> {
  if (request.phase !== "REQUEST" || response.phase !== "RESPONSE") {
    return { status: "REJECT", reason: "INVALID_PHASE" };
  }
  if (
    response.correlationId !== request.correlationId ||
    response.from !== request.to ||
    response.to !== request.from
  ) {
    return { status: "REJECT", reason: "CORRELATION_MISMATCH" };
  }
  return acceptInbound(response);
}
