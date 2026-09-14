import type { BusMessage } from "./ai-communication-bus-core.js";

export const EXECUTION_V0_BUS_IDENTITY_KEY = "bus_identity" as const;

export interface ExecutionV0BusIdentityBinding {
  messageId: string;
  traceId: string;
  stateId: string;
  stateRevision: number;
}

export type ExecutionV0BusIdentityBridgeHoldReason =
  | "INVALID_CONTAINER"
  | "BUS_IDENTITY_MISSING"
  | "BUS_IDENTITY_INVALID"
  | "REQUEST_BINDING_MISMATCH"
  | "EVIDENCE_BINDING_MISMATCH";

export type ExecutionV0BusIdentityBridgeDecision =
  | { status: "PASS"; binding: ExecutionV0BusIdentityBinding }
  | { status: "HOLD"; reason: ExecutionV0BusIdentityBridgeHoldReason };

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseBinding(value: unknown): ExecutionV0BusIdentityBinding | null {
  if (!isObjectRecord(value)) return null;
  const keys = Object.keys(value).sort();
  const expectedKeys = ["messageId", "stateId", "stateRevision", "traceId"];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    return null;
  }
  if (
    !nonEmpty(value.messageId) ||
    !nonEmpty(value.traceId) ||
    !nonEmpty(value.stateId) ||
    !Number.isInteger(value.stateRevision) ||
    (value.stateRevision as number) < 0
  ) {
    return null;
  }
  return {
    messageId: value.messageId,
    traceId: value.traceId,
    stateId: value.stateId,
    stateRevision: value.stateRevision as number,
  };
}

function exactBinding(a: ExecutionV0BusIdentityBinding, b: ExecutionV0BusIdentityBinding): boolean {
  return (
    a.messageId === b.messageId &&
    a.traceId === b.traceId &&
    a.stateId === b.stateId &&
    a.stateRevision === b.stateRevision
  );
}

export function busMessageToExecutionV0Identity(message: BusMessage): ExecutionV0BusIdentityBinding {
  return Object.freeze({
    messageId: message.messageId,
    traceId: message.traceId,
    stateId: message.current.stateId,
    stateRevision: message.current.stateRevision,
  });
}

/**
 * Fail-closed bridge between BUS identity and the existing execution_v0 JSON
 * containers. Each stored binding must independently equal the BUS identity.
 * This function intentionally performs no worker claim, network operation,
 * permit issuance, or state transition. Callers must PASS this check before
 * entering gateway_worker_pre_network_fence_v0 / durable egress.
 */
export function verifyExecutionV0BusIdentityBinding(input: {
  message: BusMessage;
  requestPayload: unknown;
  evidence: unknown;
}): ExecutionV0BusIdentityBridgeDecision {
  if (!isObjectRecord(input.requestPayload) || !isObjectRecord(input.evidence)) {
    return { status: "HOLD", reason: "INVALID_CONTAINER" };
  }

  const requestRaw = input.requestPayload[EXECUTION_V0_BUS_IDENTITY_KEY];
  const evidenceRaw = input.evidence[EXECUTION_V0_BUS_IDENTITY_KEY];
  if (requestRaw === undefined || evidenceRaw === undefined) {
    return { status: "HOLD", reason: "BUS_IDENTITY_MISSING" };
  }

  const requestBinding = parseBinding(requestRaw);
  const evidenceBinding = parseBinding(evidenceRaw);
  if (requestBinding === null || evidenceBinding === null) {
    return { status: "HOLD", reason: "BUS_IDENTITY_INVALID" };
  }

  const expected = busMessageToExecutionV0Identity(input.message);
  if (!exactBinding(requestBinding, expected)) {
    return { status: "HOLD", reason: "REQUEST_BINDING_MISMATCH" };
  }
  if (!exactBinding(evidenceBinding, expected)) {
    return { status: "HOLD", reason: "EVIDENCE_BINDING_MISMATCH" };
  }

  return { status: "PASS", binding: expected };
}
