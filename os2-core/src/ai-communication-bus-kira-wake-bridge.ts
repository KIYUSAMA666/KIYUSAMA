import {
  createBusReply,
  type BusCurrentBinding,
  type BusDeliveryRecord,
  type BusMessage,
} from "./ai-communication-bus-core.js";

export type KiraWakeStatus = "PENDING" | "UNKNOWN" | "CONFIRMED" | "TERMINAL_FAILED";

export interface KiraWakeBridgeRecord {
  messageId: string;
  traceId: string;
  targetAgentId: "KIRA";
  current: BusCurrentBinding;
  status: KiraWakeStatus;
  deploymentRunId: string | null;
  sessionId: string | null;
  observedAt: string | null;
}

export type KiraWakeResult =
  | {
      outcome: "CONSUMED";
      messageId: string;
      traceId: string;
      targetAgentId: "KIRA";
      deploymentRunId: string;
      sessionId: string;
      observedAt: string;
      authorityGranted?: boolean;
    }
  | {
      outcome: "AMBIGUOUS";
      messageId: string;
      traceId: string;
      targetAgentId: "KIRA";
      observedAt: string;
      authorityGranted?: boolean;
    }
  | {
      outcome: "REJECTED";
      messageId: string;
      traceId: string;
      targetAgentId: "KIRA";
      observedAt: string;
      authorityGranted?: boolean;
    };

export type KiraWakeHoldReason =
  | "INVALID_BUS_STATE"
  | "INVALID_TARGET"
  | "WAKE_BINDING_MISMATCH"
  | "INVALID_WAKE_EVIDENCE"
  | "INVALID_WAKE_TRANSITION"
  | "AUTHORITY_ESCALATION_FORBIDDEN"
  | "WAKE_CONFLICT"
  | "REPLY_NOT_CONFIRMED";

export type KiraWakeDecision<T> =
  | { status: "ACCEPTED"; value: T }
  | { status: "IDEMPOTENT"; value: T }
  | { status: "UNKNOWN"; value: T }
  | { status: "HOLD"; reason: KiraWakeHoldReason };

function validNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return validNonEmpty(value) && Number.isFinite(Date.parse(value));
}

function sameBinding(record: KiraWakeBridgeRecord, result: KiraWakeResult): boolean {
  return (
    result.messageId === record.messageId &&
    result.traceId === record.traceId &&
    result.targetAgentId === record.targetAgentId
  );
}

export function prepareKiraWake(
  existing: KiraWakeBridgeRecord | null,
  delivery: BusDeliveryRecord,
): KiraWakeDecision<KiraWakeBridgeRecord> {
  if (delivery.status !== "DELIVERED" && delivery.status !== "ACKNOWLEDGED") {
    return { status: "HOLD", reason: "INVALID_BUS_STATE" };
  }
  if (
    delivery.message.targetAgentId !== "KIRA" ||
    delivery.deliveredToAgentId !== "KIRA"
  ) {
    return { status: "HOLD", reason: "INVALID_TARGET" };
  }

  const next: KiraWakeBridgeRecord = {
    messageId: delivery.message.messageId,
    traceId: delivery.message.traceId,
    targetAgentId: "KIRA",
    current: structuredClone(delivery.message.current),
    status: "PENDING",
    deploymentRunId: null,
    sessionId: null,
    observedAt: null,
  };

  if (existing === null) return { status: "ACCEPTED", value: next };

  if (
    existing.messageId === next.messageId &&
    existing.traceId === next.traceId &&
    existing.targetAgentId === next.targetAgentId &&
    existing.current.stateId === next.current.stateId &&
    existing.current.stateRevision === next.current.stateRevision
  ) {
    return { status: "IDEMPOTENT", value: structuredClone(existing) };
  }

  return { status: "HOLD", reason: "WAKE_CONFLICT" };
}

export function applyKiraWakeResult(
  record: KiraWakeBridgeRecord,
  result: KiraWakeResult,
): KiraWakeDecision<KiraWakeBridgeRecord> {
  if (!sameBinding(record, result)) {
    return { status: "HOLD", reason: "WAKE_BINDING_MISMATCH" };
  }
  if (!validTimestamp(result.observedAt)) {
    return { status: "HOLD", reason: "INVALID_WAKE_EVIDENCE" };
  }
  if (result.authorityGranted === true) {
    return { status: "HOLD", reason: "AUTHORITY_ESCALATION_FORBIDDEN" };
  }

  if (record.status === "CONFIRMED") {
    if (
      result.outcome === "CONSUMED" &&
      result.deploymentRunId === record.deploymentRunId &&
      result.sessionId === record.sessionId
    ) {
      return { status: "IDEMPOTENT", value: structuredClone(record) };
    }
    return { status: "HOLD", reason: "INVALID_WAKE_TRANSITION" };
  }

  if (record.status === "TERMINAL_FAILED") {
    if (result.outcome === "REJECTED") {
      return { status: "IDEMPOTENT", value: structuredClone(record) };
    }
    return { status: "HOLD", reason: "INVALID_WAKE_TRANSITION" };
  }

  if (result.outcome === "AMBIGUOUS") {
    return {
      status: "UNKNOWN",
      value: { ...structuredClone(record), status: "UNKNOWN", observedAt: result.observedAt },
    };
  }

  if (result.outcome === "REJECTED") {
    return {
      status: "ACCEPTED",
      value: {
        ...structuredClone(record),
        status: "TERMINAL_FAILED",
        observedAt: result.observedAt,
      },
    };
  }

  if (!validNonEmpty(result.deploymentRunId) || !validNonEmpty(result.sessionId)) {
    return { status: "HOLD", reason: "INVALID_WAKE_EVIDENCE" };
  }

  return {
    status: "ACCEPTED",
    value: {
      ...structuredClone(record),
      status: "CONFIRMED",
      deploymentRunId: result.deploymentRunId,
      sessionId: result.sessionId,
      observedAt: result.observedAt,
    },
  };
}

export function createKiraWakeReply(
  parent: BusMessage,
  wake: KiraWakeBridgeRecord,
  reply: BusMessage,
): KiraWakeDecision<BusMessage> {
  if (
    wake.status !== "CONFIRMED" ||
    wake.messageId !== parent.messageId ||
    wake.traceId !== parent.traceId ||
    wake.current.stateId !== parent.current.stateId ||
    wake.current.stateRevision !== parent.current.stateRevision
  ) {
    return { status: "HOLD", reason: "REPLY_NOT_CONFIRMED" };
  }

  const decision = createBusReply(parent, reply);
  if (decision.status === "HOLD") {
    return { status: "HOLD", reason: "WAKE_BINDING_MISMATCH" };
  }
  return { status: "ACCEPTED", value: decision.value };
}
