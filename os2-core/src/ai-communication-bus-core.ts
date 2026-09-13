export type BusMessageKind = "MESSAGE" | "REPLY";
export type BusDeliveryStatus = "PENDING" | "DELIVERED" | "ACKNOWLEDGED" | "TERMINAL_FAILED";

export interface BusCurrentBinding {
  stateId: string;
  stateRevision: number;
}

export interface BusMessage {
  messageId: string;
  traceId: string;
  kind: BusMessageKind;
  sourceAgentId: string;
  targetAgentId: string;
  parentMessageId: string | null;
  current: BusCurrentBinding;
  createdAt: string;
  payload: unknown;
}

export interface BusDeliveryRecord {
  message: BusMessage;
  status: BusDeliveryStatus;
  deliveredToAgentId: string | null;
  acknowledgedByAgentId: string | null;
}

export interface BusAck {
  messageId: string;
  traceId: string;
  recipientAgentId: string;
}

export type BusDecision<T> =
  | { status: "ACCEPTED"; value: T }
  | { status: "IDEMPOTENT"; value: T }
  | { status: "HOLD"; reason: BusHoldReason };

export type BusHoldReason =
  | "INVALID_MESSAGE"
  | "SELF_LOOP_FORBIDDEN"
  | "MESSAGE_ID_CONFLICT"
  | "WRONG_RECIPIENT"
  | "INVALID_DELIVERY_STATE"
  | "ACK_MISMATCH"
  | "REPLY_MISMATCH"
  | "CURRENT_BINDING_MISMATCH";

const PROTECTED_CONTROL_KEYS = new Set([
  "activeRolesAndAuthority",
  "humanDecisionFinal",
  "activeGuards",
  "independentLaneHealth",
]);

function validNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return validNonEmpty(value) && Number.isFinite(Date.parse(value));
}

function payloadTouchesProtectedControl(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false;
  return Object.keys(payload as Record<string, unknown>).some((key) => PROTECTED_CONTROL_KEYS.has(key));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactMessage(a: BusMessage, b: BusMessage): boolean {
  return canonical(a) === canonical(b);
}

export function validateBusMessage(message: BusMessage): BusDecision<BusMessage> {
  if (
    !validNonEmpty(message.messageId) ||
    !validNonEmpty(message.traceId) ||
    !validNonEmpty(message.sourceAgentId) ||
    !validNonEmpty(message.targetAgentId) ||
    !validNonEmpty(message.current?.stateId) ||
    !Number.isInteger(message.current?.stateRevision) ||
    message.current.stateRevision < 0 ||
    !validTimestamp(message.createdAt) ||
    (message.kind !== "MESSAGE" && message.kind !== "REPLY") ||
    (message.kind === "MESSAGE" && message.parentMessageId !== null) ||
    (message.kind === "REPLY" && !validNonEmpty(message.parentMessageId)) ||
    payloadTouchesProtectedControl(message.payload)
  ) {
    return { status: "HOLD", reason: "INVALID_MESSAGE" };
  }

  if (message.sourceAgentId === message.targetAgentId) {
    return { status: "HOLD", reason: "SELF_LOOP_FORBIDDEN" };
  }

  return { status: "ACCEPTED", value: structuredClone(message) };
}

export function publishBusMessage(
  existing: BusDeliveryRecord | null,
  message: BusMessage,
): BusDecision<BusDeliveryRecord> {
  const validation = validateBusMessage(message);
  if (validation.status === "HOLD") return validation;

  if (existing !== null) {
    if (!exactMessage(existing.message, validation.value)) {
      return { status: "HOLD", reason: "MESSAGE_ID_CONFLICT" };
    }
    return { status: "IDEMPOTENT", value: structuredClone(existing) };
  }

  return {
    status: "ACCEPTED",
    value: {
      message: validation.value,
      status: "PENDING",
      deliveredToAgentId: null,
      acknowledgedByAgentId: null,
    },
  };
}

export function deliverBusMessage(
  record: BusDeliveryRecord,
  recipientAgentId: string,
): BusDecision<BusDeliveryRecord> {
  if (!validNonEmpty(recipientAgentId) || recipientAgentId !== record.message.targetAgentId) {
    return { status: "HOLD", reason: "WRONG_RECIPIENT" };
  }

  if (record.status === "DELIVERED" || record.status === "ACKNOWLEDGED") {
    if (record.deliveredToAgentId !== recipientAgentId) {
      return { status: "HOLD", reason: "WRONG_RECIPIENT" };
    }
    return { status: "IDEMPOTENT", value: structuredClone(record) };
  }

  if (record.status !== "PENDING") {
    return { status: "HOLD", reason: "INVALID_DELIVERY_STATE" };
  }

  return {
    status: "ACCEPTED",
    value: {
      ...structuredClone(record),
      status: "DELIVERED",
      deliveredToAgentId: recipientAgentId,
    },
  };
}

export function acknowledgeBusMessage(
  record: BusDeliveryRecord,
  ack: BusAck,
): BusDecision<BusDeliveryRecord> {
  if (
    ack.messageId !== record.message.messageId ||
    ack.traceId !== record.message.traceId ||
    ack.recipientAgentId !== record.message.targetAgentId
  ) {
    return { status: "HOLD", reason: "ACK_MISMATCH" };
  }

  if (record.status === "ACKNOWLEDGED") {
    if (record.acknowledgedByAgentId !== ack.recipientAgentId) {
      return { status: "HOLD", reason: "ACK_MISMATCH" };
    }
    return { status: "IDEMPOTENT", value: structuredClone(record) };
  }

  if (record.status !== "DELIVERED" || record.deliveredToAgentId !== ack.recipientAgentId) {
    return { status: "HOLD", reason: "INVALID_DELIVERY_STATE" };
  }

  return {
    status: "ACCEPTED",
    value: {
      ...structuredClone(record),
      status: "ACKNOWLEDGED",
      acknowledgedByAgentId: ack.recipientAgentId,
    },
  };
}

export function createBusReply(
  parent: BusMessage,
  reply: BusMessage,
): BusDecision<BusMessage> {
  const validation = validateBusMessage(reply);
  if (validation.status === "HOLD") return validation;

  if (
    reply.kind !== "REPLY" ||
    reply.parentMessageId !== parent.messageId ||
    reply.traceId !== parent.traceId ||
    reply.sourceAgentId !== parent.targetAgentId ||
    reply.targetAgentId !== parent.sourceAgentId
  ) {
    return { status: "HOLD", reason: "REPLY_MISMATCH" };
  }

  if (
    reply.current.stateId !== parent.current.stateId ||
    reply.current.stateRevision < parent.current.stateRevision
  ) {
    return { status: "HOLD", reason: "CURRENT_BINDING_MISMATCH" };
  }

  return { status: "ACCEPTED", value: validation.value };
}
