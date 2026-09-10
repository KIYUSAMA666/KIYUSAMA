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

export function evaluateActionEvidenceRequirement(
  input: ActionEvidenceEvaluationInput,
): ActionEvidenceDecision {
  for (const requiredRefId of input.requirement.requiredRefIds) {
    const matchedRef = input.snapshot.confirmedRefIndex.find(
      (ref) => ref.id === requiredRefId,
    );

    if (matchedRef === undefined) {
      return { status: "HOLD", reason: "REQUIRED_REF_MISSING" };
    }

    if (matchedRef.status !== "VERIFIED") {
      return { status: "HOLD", reason: "REQUIRED_REF_UNVERIFIED" };
    }
  }

  if (input.requirement.requireIndependentLane) {
    if (
      input.snapshot.independentLaneHealth.status !== "VERIFIED" ||
      input.snapshot.independentLaneHealth.evidenceVerdict !== "SUFFICIENT"
    ) {
      return { status: "HOLD", reason: "INDEPENDENT_LANE_NOT_READY" };
    }
  }

  return { status: "SATISFIED" };
}
