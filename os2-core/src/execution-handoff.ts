import type { ActionEvidenceRequirement } from "./action-evidence-requirement.js";
import type { CapabilitySlot } from "./capability-slot.js";
import type { CurrentStateSnapshot } from "./current-state.js";
import type { PreExecutionGateDecision } from "./pre-execution-gate.js";

export const MAX_EXECUTION_HANDOFF_TTL_MS = 60 * 60 * 1000;

export interface ExecutionHandoffInput {
  snapshot: CurrentStateSnapshot;
  actionEvidenceRequirement: ActionEvidenceRequirement;
  capabilitySlot: CapabilitySlot;
  gateDecision: PreExecutionGateDecision;
}

export interface ExecutionHandoffRequest {
  handoffId: string;
  traceId: string;
  actionId: string;
  sourceStateId: string;
  sourceStateRevision: number;
  capabilityId: string;
  implementationId: string;
  issuedAt: string;
  expiresAt: string;
  evidenceRefIds: string[];
}

export type ExecutionHandoffHoldReason =
  | "GATE_NOT_ALLOWED"
  | "GATE_DECISION_MISMATCH"
  | "CAPABILITY_NOT_READY"
  | "HANDOFF_MISMATCH"
  | "STATE_CHANGED"
  | "EVIDENCE_NOT_VERIFIED"
  | "INDEPENDENT_LANE_NOT_READY"
  | "INVALID_LIFETIME"
  | "EXPIRED";

export type ExecutionHandoffDecision =
  | { status: "READY" }
  | { status: "HOLD"; reason: ExecutionHandoffHoldReason };

export function evaluateExecutionHandoff(
  input: ExecutionHandoffInput,
  request: ExecutionHandoffRequest,
  now: string,
): ExecutionHandoffDecision {
  if (input.gateDecision.status !== "ALLOW") {
    return { status: "HOLD", reason: "GATE_NOT_ALLOWED" };
  }

  if (
    input.gateDecision.actionId !== request.actionId ||
    input.gateDecision.stateId !== request.sourceStateId ||
    input.gateDecision.stateRevision !== request.sourceStateRevision ||
    input.gateDecision.actionId !== input.snapshot.nextActionSingle.actionId ||
    input.gateDecision.stateId !== input.snapshot.identity.stateId ||
    input.gateDecision.stateRevision !== input.snapshot.identity.stateRevision
  ) {
    return { status: "HOLD", reason: "GATE_DECISION_MISMATCH" };
  }

  const binding = input.capabilitySlot.binding;
  if (input.capabilitySlot.status !== "BOUND" || binding === null || !binding.verified) {
    return { status: "HOLD", reason: "CAPABILITY_NOT_READY" };
  }

  if (
    request.actionId !== input.snapshot.nextActionSingle.actionId ||
    input.actionEvidenceRequirement.actionId !== request.actionId ||
    request.capabilityId !== input.capabilitySlot.capabilityId ||
    request.capabilityId !== binding.capabilityId ||
    request.implementationId !== binding.implementationId
  ) {
    return { status: "HOLD", reason: "HANDOFF_MISMATCH" };
  }

  if (
    request.sourceStateId !== input.snapshot.identity.stateId ||
    request.sourceStateRevision !== input.snapshot.identity.stateRevision
  ) {
    return { status: "HOLD", reason: "STATE_CHANGED" };
  }

  if (
    input.actionEvidenceRequirement.requireIndependentLane &&
    (input.snapshot.independentLaneHealth.status !== "VERIFIED" ||
      input.snapshot.independentLaneHealth.evidenceVerdict !== "SUFFICIENT")
  ) {
    return { status: "HOLD", reason: "INDEPENDENT_LANE_NOT_READY" };
  }

  const requiredRefIds = input.actionEvidenceRequirement.requiredRefIds;
  if (
    request.evidenceRefIds.length !== requiredRefIds.length ||
    !requiredRefIds.every((requiredRefId) => request.evidenceRefIds.includes(requiredRefId)) ||
    !requiredRefIds.every((requiredRefId) =>
      input.snapshot.confirmedRefIndex.some(
        (ref) => ref.id === requiredRefId && ref.status === "VERIFIED",
      ),
    )
  ) {
    return { status: "HOLD", reason: "EVIDENCE_NOT_VERIFIED" };
  }

  const issuedAtMs = Date.parse(request.issuedAt);
  const expiresAtMs = Date.parse(request.expiresAt);
  const nowMs = Date.parse(now);
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    !Number.isFinite(nowMs) ||
    issuedAtMs > nowMs ||
    expiresAtMs <= issuedAtMs ||
    expiresAtMs - issuedAtMs > MAX_EXECUTION_HANDOFF_TTL_MS
  ) {
    return { status: "HOLD", reason: "INVALID_LIFETIME" };
  }

  if (expiresAtMs <= nowMs) {
    return { status: "HOLD", reason: "EXPIRED" };
  }

  return { status: "READY" };
}
