import {
  validateBusMessage,
  type BusDeliveryRecord,
  type BusMessage,
} from "./ai-communication-bus-core.js";

export type DurableBusStatus =
  | "PENDING"
  | "DELIVERED"
  | "ACKNOWLEDGED"
  | "UNKNOWN"
  | "TERMINAL_FAILED";

export interface DurableBusRecord {
  message: BusMessage;
  status: DurableBusStatus;
  deliveredToAgentId: string | null;
  acknowledgedByAgentId: string | null;
  attemptSequence: number;
  updatedAt: string;
  unknownReason: string | null;
}

export type DurableBusRecoveryDisposition =
  | "PENDING_DELIVERY"
  | "DELIVERY_OBSERVED"
  | "ACKNOWLEDGED"
  | "UNKNOWN_NO_RETRY"
  | "TERMINAL";

export type DurableBusDecision<T> =
  | { status: "ACCEPTED"; value: T }
  | { status: "RECOVERED"; value: T; disposition: DurableBusRecoveryDisposition }
  | { status: "IDEMPOTENT"; value: T }
  | { status: "HOLD"; reason: DurableBusHoldReason };

export type DurableBusHoldReason =
  | "INVALID_DURABLE_RECORD"
  | "CURRENT_BINDING_MISMATCH"
  | "INVALID_STATE_TRANSITION"
  | "UNKNOWN_REQUIRES_RECONCILIATION";

function validNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return validNonEmpty(value) && Number.isFinite(Date.parse(value));
}

function validAgentOrNull(value: unknown): value is string | null {
  return value === null || validNonEmpty(value);
}

function exactTargetOrNull(value: string | null, targetAgentId: string): boolean {
  return value === null || value === targetAgentId;
}

function validateStateShape(record: DurableBusRecord): boolean {
  const target = record.message.targetAgentId;
  if (!validAgentOrNull(record.deliveredToAgentId) || !validAgentOrNull(record.acknowledgedByAgentId)) {
    return false;
  }
  if (!exactTargetOrNull(record.deliveredToAgentId, target) || !exactTargetOrNull(record.acknowledgedByAgentId, target)) {
    return false;
  }

  switch (record.status) {
    case "PENDING":
      return record.deliveredToAgentId === null && record.acknowledgedByAgentId === null && record.unknownReason === null;
    case "DELIVERED":
      return record.deliveredToAgentId === target && record.acknowledgedByAgentId === null && record.unknownReason === null;
    case "ACKNOWLEDGED":
      return record.deliveredToAgentId === target && record.acknowledgedByAgentId === target && record.unknownReason === null;
    case "UNKNOWN":
      return record.acknowledgedByAgentId === null && validNonEmpty(record.unknownReason);
    case "TERMINAL_FAILED":
      return record.acknowledgedByAgentId === null && record.unknownReason === null;
    default:
      return false;
  }
}

function recoveryDisposition(status: DurableBusStatus): DurableBusRecoveryDisposition {
  switch (status) {
    case "PENDING": return "PENDING_DELIVERY";
    case "DELIVERED": return "DELIVERY_OBSERVED";
    case "ACKNOWLEDGED": return "ACKNOWLEDGED";
    case "UNKNOWN": return "UNKNOWN_NO_RETRY";
    case "TERMINAL_FAILED": return "TERMINAL";
  }
}

export function toDurableBusRecord(
  record: BusDeliveryRecord,
  attemptSequence: number,
  updatedAt: string,
): DurableBusDecision<DurableBusRecord> {
  if (!Number.isInteger(attemptSequence) || attemptSequence < 0 || !validTimestamp(updatedAt)) {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }
  const messageValidation = validateBusMessage(record.message);
  if (messageValidation.status === "HOLD") {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }

  const durable: DurableBusRecord = {
    message: messageValidation.value,
    status: record.status,
    deliveredToAgentId: record.deliveredToAgentId,
    acknowledgedByAgentId: record.acknowledgedByAgentId,
    attemptSequence,
    updatedAt,
    unknownReason: null,
  };
  if (!validateStateShape(durable)) {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }
  return { status: "ACCEPTED", value: structuredClone(durable) };
}

export function markDurableBusUnknown(
  record: DurableBusRecord,
  reason: string,
  updatedAt: string,
): DurableBusDecision<DurableBusRecord> {
  if (!validNonEmpty(reason) || !validTimestamp(updatedAt)) {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }
  if (record.status === "UNKNOWN") {
    if (record.unknownReason !== reason) {
      return { status: "HOLD", reason: "INVALID_STATE_TRANSITION" };
    }
    return { status: "IDEMPOTENT", value: structuredClone(record) };
  }
  if (record.status !== "PENDING" && record.status !== "DELIVERED") {
    return { status: "HOLD", reason: "INVALID_STATE_TRANSITION" };
  }
  const next: DurableBusRecord = {
    ...structuredClone(record),
    status: "UNKNOWN",
    updatedAt,
    unknownReason: reason,
  };
  if (!validateStateShape(next)) {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }
  return { status: "ACCEPTED", value: next };
}

export function reconcileDurableBusUnknown(
  record: DurableBusRecord,
  observed: "DELIVERED" | "NOT_DELIVERED" | "TERMINAL_FAILED",
  updatedAt: string,
): DurableBusDecision<DurableBusRecord> {
  if (record.status !== "UNKNOWN") {
    return { status: "HOLD", reason: "INVALID_STATE_TRANSITION" };
  }
  if (!validTimestamp(updatedAt)) {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }

  const next: DurableBusRecord = {
    ...structuredClone(record),
    status: observed === "DELIVERED" ? "DELIVERED" : observed === "NOT_DELIVERED" ? "PENDING" : "TERMINAL_FAILED",
    deliveredToAgentId: observed === "DELIVERED" ? record.message.targetAgentId : null,
    acknowledgedByAgentId: null,
    updatedAt,
    unknownReason: null,
  };
  if (!validateStateShape(next)) {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }
  return { status: "ACCEPTED", value: next };
}

export function recoverDurableBusRecord(
  raw: unknown,
  expectedCurrent: { stateId: string; stateRevision: number },
): DurableBusDecision<DurableBusRecord> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }

  const candidate = raw as Partial<DurableBusRecord>;
  if (
    candidate.message === undefined ||
    candidate.status === undefined ||
    !Number.isInteger(candidate.attemptSequence) ||
    (candidate.attemptSequence as number) < 0 ||
    !validTimestamp(candidate.updatedAt) ||
    !(candidate.unknownReason === null || validNonEmpty(candidate.unknownReason))
  ) {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }

  const messageValidation = validateBusMessage(candidate.message as BusMessage);
  if (messageValidation.status === "HOLD") {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }

  if (
    messageValidation.value.current.stateId !== expectedCurrent.stateId ||
    messageValidation.value.current.stateRevision !== expectedCurrent.stateRevision
  ) {
    return { status: "HOLD", reason: "CURRENT_BINDING_MISMATCH" };
  }

  const record: DurableBusRecord = {
    message: messageValidation.value,
    status: candidate.status as DurableBusStatus,
    deliveredToAgentId: candidate.deliveredToAgentId ?? null,
    acknowledgedByAgentId: candidate.acknowledgedByAgentId ?? null,
    attemptSequence: candidate.attemptSequence as number,
    updatedAt: candidate.updatedAt as string,
    unknownReason: candidate.unknownReason as string | null,
  };

  if (!validateStateShape(record)) {
    return { status: "HOLD", reason: "INVALID_DURABLE_RECORD" };
  }

  return {
    status: "RECOVERED",
    value: structuredClone(record),
    disposition: recoveryDisposition(record.status),
  };
}

export function mayBlindlyRetryRecoveredBusRecord(record: DurableBusRecord): DurableBusDecision<DurableBusRecord> {
  if (record.status === "UNKNOWN") {
    return { status: "HOLD", reason: "UNKNOWN_REQUIRES_RECONCILIATION" };
  }
  return { status: "ACCEPTED", value: structuredClone(record) };
}
