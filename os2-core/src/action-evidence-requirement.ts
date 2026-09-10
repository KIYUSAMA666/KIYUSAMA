import type { CurrentStateSnapshot } from "./current-state.js";

export interface RequiredEvidenceRefBinding {
  id: string;
  expectedVersion: string | null;
  path: string | null;
}

export interface ActionEvidenceRequirement {
  actionId: string;
  requiredRefs: ReadonlyArray<RequiredEvidenceRefBinding>;
  requireIndependentLane: boolean;
}

export type ActionEvidenceHoldReason =
  | "REQUIRED_REF_MISSING"
  | "REQUIRED_REF_UNVERIFIED"
  | "REQUIRED_REF_BINDING_MISMATCH"
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
  const seen = new Set<string>();
  for (const requiredRef of input.requirement.requiredRefs) {
    if (!requiredRef.id.trim() || seen.has(requiredRef.id)) {
      return { status: "HOLD", reason: "REQUIRED_REF_BINDING_MISMATCH" };
    }
    seen.add(requiredRef.id);

    const matchedRef = input.snapshot.confirmedRefIndex.find(
      (ref) => ref.id === requiredRef.id,
    );

    if (matchedRef === undefined) {
      return { status: "HOLD", reason: "REQUIRED_REF_MISSING" };
    }

    if (matchedRef.status !== "VERIFIED") {
      return { status: "HOLD", reason: "REQUIRED_REF_UNVERIFIED" };
    }

    if (
      matchedRef.expectedVersion !== requiredRef.expectedVersion ||
      matchedRef.path !== requiredRef.path
    ) {
      return { status: "HOLD", reason: "REQUIRED_REF_BINDING_MISMATCH" };
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
