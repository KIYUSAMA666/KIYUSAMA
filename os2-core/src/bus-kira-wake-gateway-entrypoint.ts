import type { BusMessage } from "./ai-communication-bus-core.js";
import { verifyExecutionV0BusIdentityBinding } from "./execution-v0-bus-identity-bridge.js";

export const BUS_KIRA_WAKE_GATEWAY_ADAPTER_ID = "BUS_KIRA_WAKE_GATEWAY_V1" as const;

export interface BusKiraWakeGatewayDispatch {
  dispatch_id: string;
  execution_id: string;
  task_id: string;
  generation: number;
  adapter_id: string;
  operation: string;
  route_mode: string;
  target_scope: string;
  request_payload: unknown;
  evidence: unknown;
  status: string;
  claimed_worker_id: string | null;
  claimed_worker_epoch: number | null;
  worker_epoch: number;
}

export interface BusKiraWakeGatewayRequest {
  dispatchId: string;
  workerId: string;
  workerEpoch: number;
  message: BusMessage;
}

export type BusKiraWakeGatewayAdmissionReason =
  | "BINDING_REQUIRED"
  | "POST_PERMIT_BINDING_CHANGED"
  | "ADAPTER_MISMATCH"
  | "BUS_IDENTITY_HOLD";

export type BusKiraWakeGatewayAdmission =
  | {
      status: "PASS";
      dispatchId: string;
      workerId: string;
      workerEpoch: number;
      generation: number;
      executionId: string;
      taskId: string;
    }
  | { status: "HOLD"; reason: BusKiraWakeGatewayAdmissionReason; detail?: string };

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Receiver-side admission for the BUS/KIRA WAKE gateway.
 *
 * This function is intentionally called only AFTER the durable
 * execution_v0 egress permit has been consumed by the HTTP entrypoint.
 * It mirrors the active execution-github-egress-gateway-v1 pattern:
 * consume durable permit first, then re-read dispatch and re-bind worker,
 * epoch, generation and adapter before any external action.
 *
 * The adapter guard is deliberately symmetric with GITHUB_GATEWAY_V1:
 * this gateway must never process another adapter's dispatch.
 */
export function admitBusKiraWakeGatewayDispatch(input: {
  request: BusKiraWakeGatewayRequest;
  dispatch: BusKiraWakeGatewayDispatch;
}): BusKiraWakeGatewayAdmission {
  const { request, dispatch } = input;

  if (
    !nonEmpty(request.dispatchId) ||
    !nonEmpty(request.workerId) ||
    !positiveInteger(request.workerEpoch) ||
    !nonEmpty(dispatch.dispatch_id) ||
    !positiveInteger(dispatch.generation)
  ) {
    return { status: "HOLD", reason: "BINDING_REQUIRED" };
  }

  if (
    dispatch.dispatch_id !== request.dispatchId ||
    dispatch.status !== "RUNNING" ||
    dispatch.claimed_worker_id !== request.workerId ||
    dispatch.claimed_worker_epoch !== request.workerEpoch ||
    dispatch.worker_epoch !== request.workerEpoch
  ) {
    return { status: "HOLD", reason: "POST_PERMIT_BINDING_CHANGED" };
  }

  if (dispatch.adapter_id !== BUS_KIRA_WAKE_GATEWAY_ADAPTER_ID) {
    return { status: "HOLD", reason: "ADAPTER_MISMATCH" };
  }

  const identity = verifyExecutionV0BusIdentityBinding({
    message: request.message,
    requestPayload: dispatch.request_payload,
    evidence: dispatch.evidence,
  });
  if (identity.status !== "PASS") {
    return { status: "HOLD", reason: "BUS_IDENTITY_HOLD", detail: identity.reason };
  }

  return {
    status: "PASS",
    dispatchId: dispatch.dispatch_id,
    workerId: request.workerId,
    workerEpoch: request.workerEpoch,
    generation: dispatch.generation,
    executionId: dispatch.execution_id,
    taskId: dispatch.task_id,
  };
}
