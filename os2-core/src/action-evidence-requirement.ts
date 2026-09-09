import type { CurrentStateSnapshot } from "./current-state.js";

export interface ActionEvidenceRequirement {
  actionId: string;
  requiredRefIds: ReadonlyArray<string>;
  requireIndependentLane: boolean;
}

export type ActionEvidenceHoldReason =
  | "REQUIRED_REF_MISSING"
  | "REQUIRED_REF_UNVERIFIED"
  | "INDEPENDENT_LANE_NOT_READY";

export type ActionEvidenceDecision =
  | { status: "SATISFIED" }
  | { status: "HOLD"; reason: ActionEvidenceHoldReason };

export interface ActionEvidenceEvaluationInput {
  requirement: ActionEvidenceRequirement;
  snapshot: CurrentStateSnapshot;
}
