import type { CurrentStateSnapshot } from "./current-state.js";
import type { CandidateDecision } from "./memory-selection.js";
import type { CapabilitySlot } from "./capability-slot.js";

export type PreExecutionHoldReason =
  | "INVALID_SNAPSHOT"
  | "ACTION_NOT_CURRENT"
  | "NON_CURRENT_MEMORY"
  | "UNVERIFIED_ACTIVE_GUARD"
  | "CAPABILITY_NOT_READY"
  | "CAPABILITY_MISMATCH";

export interface PreExecutionGateInput<T = unknown> {
  actionId: string;
  snapshot: CurrentStateSnapshot;
  memoryDecision: CandidateDecision<T>;
  requiredCapabilityId?: string;
  capabilitySlot?: CapabilitySlot;
}

export type PreExecutionGateDecision =
  | { status: "ALLOW" }
  | { status: "HOLD"; reason: PreExecutionHoldReason };
