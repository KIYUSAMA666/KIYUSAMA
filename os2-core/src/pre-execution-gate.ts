import { assertSnapshotInvariant, type CurrentStateSnapshot } from "./current-state.js";
import type { CandidateDecision } from "./memory-selection.js";
import type { CapabilitySlot } from "./capability-slot.js";
import type { ActionEvidenceDecision } from "./action-evidence-requirement.js";

export type PreExecutionHoldReason =
  | "INVALID_SNAPSHOT"
  | "ACTION_NOT_CURRENT"
  | "NON_CURRENT_MEMORY"
  | "UNVERIFIED_ACTIVE_GUARD"
  | "CAPABILITY_NOT_READY"
  | "CAPABILITY_MISMATCH"
  | "ACTION_EVIDENCE_NOT_SATISFIED";

export interface PreExecutionGateInput<T = unknown> {
  actionId: string;
  snapshot: CurrentStateSnapshot;
  memoryDecision: CandidateDecision<T>;
  actionEvidenceDecision: ActionEvidenceDecision;
  requiredCapabilityId?: string;
  capabilitySlot?: CapabilitySlot;
}

export type PreExecutionGateDecision =
  | { status: "ALLOW" }
  | { status: "HOLD"; reason: PreExecutionHoldReason };

export function evaluatePreExecutionGate<T = unknown>(
  input: PreExecutionGateInput<T>,
): PreExecutionGateDecision {
  try {
    assertSnapshotInvariant(input.snapshot);
  } catch {
    return { status: "HOLD", reason: "INVALID_SNAPSHOT" };
  }

  if (input.actionId !== input.snapshot.nextActionSingle.actionId) {
    return { status: "HOLD", reason: "ACTION_NOT_CURRENT" };
  }

  if (input.memoryDecision.status !== "EXECUTION_CANDIDATE") {
    return { status: "HOLD", reason: "NON_CURRENT_MEMORY" };
  }

  if (input.snapshot.activeGuards.some((guard) => guard.refConfirmed !== "VERIFIED")) {
    return { status: "HOLD", reason: "UNVERIFIED_ACTIVE_GUARD" };
  }

  if (input.actionEvidenceDecision.status !== "SATISFIED") {
    return { status: "HOLD", reason: "ACTION_EVIDENCE_NOT_SATISFIED" };
  }

  if (input.requiredCapabilityId !== undefined) {
    const slot = input.capabilitySlot;
    if (slot === undefined || slot.status !== "BOUND" || slot.binding === null || !slot.binding.verified) {
      return { status: "HOLD", reason: "CAPABILITY_NOT_READY" };
    }
    if (slot.capabilityId !== input.requiredCapabilityId || slot.binding.capabilityId !== input.requiredCapabilityId) {
      return { status: "HOLD", reason: "CAPABILITY_MISMATCH" };
    }
  }

  return { status: "ALLOW" };
}
