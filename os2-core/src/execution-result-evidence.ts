import type { CurrentStateSnapshot } from "./current-state.js";
import type { ExecutionHandoffRequest } from "./execution-handoff.js";

export type ExecutionOutcome = "SUCCEEDED" | "FAILED" | "UNKNOWN";
export type AcceptedExecutionOutcome = Exclude<ExecutionOutcome, "UNKNOWN">;
export type ExecutionResultVerification = "VERIFIED" | "UNVERIFIED" | "CONFLICT";

export interface ExecutionResultEvidence {
  resultId: string;
  handoffId: string;
  traceId: string;
  actionId: string;
  sourceStateId: string;
  sourceStateRevision: number;
  capabilityId: string;
  implementationId: string;
  executorId: string;
  verifierId: string;
  outcome: ExecutionOutcome;
  providerExecutionId: string | null;
  observedAt: string;
  evidenceRefIds: ReadonlyArray<string>;
  verification: ExecutionResultVerification;
}

export type ExecutionResultDecision =
  | { status: "ACCEPTED"; outcome: AcceptedExecutionOutcome }
  | {
      status: "HOLD";
      reason:
        | "UNVERIFIED_RESULT"
        | "RESULT_CONFLICT"
        | "RESULT_UNKNOWN"
        | "SELF_VERIFICATION_FORBIDDEN"
        | "RESULT_EVIDENCE_MISSING"
        | "RESULT_EVIDENCE_UNVERIFIED"
        | "RESULT_EVIDENCE_BINDING_MISMATCH"
        | "VERIFIER_BINDING_MISMATCH"
        | "EVIDENCE_SOURCE_MISMATCH"
        | "INDEPENDENT_LANE_NOT_READY"
        | "HANDOFF_MISMATCH"
        | "STATE_MISMATCH"
        | "OBSERVED_AT_OUT_OF_WINDOW"
        | "INVALID_RESULT";
    };

export interface ExecutionResultEvaluationInput {
  snapshot: CurrentStateSnapshot;
  handoff: ExecutionHandoffRequest;
  evidence: ExecutionResultEvidence;
}

export function evaluateExecutionResultEvidence(
  input: ExecutionResultEvaluationInput,
): ExecutionResultDecision {
  const { snapshot, handoff, evidence } = input;

  const observedAtMs = Date.parse(evidence.observedAt);
  if (
    !evidence.resultId.trim() ||
    !evidence.executorId.trim() ||
    !evidence.verifierId.trim() ||
    !evidence.observedAt.trim() ||
    !Number.isFinite(observedAtMs)
  ) {
    return { status: "HOLD", reason: "INVALID_RESULT" };
  }

  const issuedAtMs = Date.parse(handoff.issuedAt);
  const expiresAtMs = Date.parse(handoff.expiresAt);
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    observedAtMs < issuedAtMs ||
    observedAtMs > expiresAtMs
  ) {
    return { status: "HOLD", reason: "OBSERVED_AT_OUT_OF_WINDOW" };
  }

  if (
    evidence.handoffId !== handoff.handoffId ||
    evidence.traceId !== handoff.traceId ||
    evidence.actionId !== handoff.actionId ||
    evidence.capabilityId !== handoff.capabilityId ||
    evidence.implementationId !== handoff.implementationId
  ) {
    return { status: "HOLD", reason: "HANDOFF_MISMATCH" };
  }

  if (
    evidence.sourceStateId !== handoff.sourceStateId ||
    evidence.sourceStateRevision !== handoff.sourceStateRevision ||
    evidence.sourceStateId !== snapshot.identity.stateId ||
    evidence.sourceStateRevision !== snapshot.identity.stateRevision
  ) {
    return { status: "HOLD", reason: "STATE_MISMATCH" };
  }

  if (evidence.executorId === evidence.verifierId) {
    return { status: "HOLD", reason: "SELF_VERIFICATION_FORBIDDEN" };
  }

  if (evidence.verifierId !== handoff.resultEvidencePolicy.verifierId) {
    return { status: "HOLD", reason: "VERIFIER_BINDING_MISMATCH" };
  }

  if (snapshot.independentLaneHealth.evidenceSource !== handoff.resultEvidencePolicy.evidenceSource) {
    return { status: "HOLD", reason: "EVIDENCE_SOURCE_MISMATCH" };
  }

  if (
    snapshot.independentLaneHealth.status !== "VERIFIED" ||
    snapshot.independentLaneHealth.evidenceVerdict !== "SUFFICIENT"
  ) {
    return { status: "HOLD", reason: "INDEPENDENT_LANE_NOT_READY" };
  }

  const requiredResultRefs = handoff.resultEvidencePolicy.requiredRefs;
  if (evidence.evidenceRefIds.length === 0) {
    return { status: "HOLD", reason: "RESULT_EVIDENCE_MISSING" };
  }

  const actualIds = new Set(evidence.evidenceRefIds);
  const requiredIds = new Set(requiredResultRefs.map((ref) => ref.id));
  if (
    actualIds.size !== evidence.evidenceRefIds.length ||
    requiredIds.size !== requiredResultRefs.length ||
    evidence.evidenceRefIds.length !== requiredResultRefs.length ||
    !requiredResultRefs.every((requiredRef) => actualIds.has(requiredRef.id))
  ) {
    return { status: "HOLD", reason: "RESULT_EVIDENCE_BINDING_MISMATCH" };
  }

  for (const requiredRef of requiredResultRefs) {
    const matchedRef = snapshot.confirmedRefIndex.find((ref) => ref.id === requiredRef.id);
    if (matchedRef === undefined) {
      return { status: "HOLD", reason: "RESULT_EVIDENCE_MISSING" };
    }
    if (matchedRef.status !== "VERIFIED") {
      return { status: "HOLD", reason: "RESULT_EVIDENCE_UNVERIFIED" };
    }
    if (
      matchedRef.expectedVersion !== requiredRef.expectedVersion ||
      matchedRef.path !== requiredRef.path
    ) {
      return { status: "HOLD", reason: "RESULT_EVIDENCE_BINDING_MISMATCH" };
    }
  }

  if (evidence.verification === "CONFLICT") {
    return { status: "HOLD", reason: "RESULT_CONFLICT" };
  }

  if (evidence.verification !== "VERIFIED") {
    return { status: "HOLD", reason: "UNVERIFIED_RESULT" };
  }

  if (evidence.outcome === "UNKNOWN") {
    return { status: "HOLD", reason: "RESULT_UNKNOWN" };
  }

  return { status: "ACCEPTED", outcome: evidence.outcome };
}
