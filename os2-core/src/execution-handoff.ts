import type { ActionEvidenceRequirement } from "./action-evidence-requirement.js";
import type { CapabilitySlot } from "./capability-slot.js";
import type { CurrentStateSnapshot } from "./current-state.js";
import type { PreExecutionGateDecision } from "./pre-execution-gate.js";

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
  expiresAt: string;
  evidenceRefIds: string[];
}

export type ExecutionHandoffHoldReason =
  | "GATE_NOT_ALLOWED"
  | "CAPABILITY_NOT_READY"
  | "HANDOFF_MISMATCH"
  | "STATE_CHANGED"
  | "EVIDENCE_NOT_VERIFIED"
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
    request.sourceStateId !== input.snapshot.stateId ||
    request.sourceStateRevision !== input.snapshot.stateRevision
  ) {
    return { status: "HOLD", reason: "STATE_CHANGED" };
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

  const expiresAtMs = Date.parse(request.expiresAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs) || expiresAtMs <= nowMs) {
    return { status: "HOLD", reason: "EXPIRED" };
  }

  return { status: "READY" };
}
