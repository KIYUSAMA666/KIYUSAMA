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
