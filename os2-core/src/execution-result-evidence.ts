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
        | "HANDOFF_MISMATCH"
        | "STATE_MISMATCH"
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

  if (
    !evidence.resultId.trim() ||
    !evidence.executorId.trim() ||
    !evidence.verifierId.trim() ||
    !evidence.observedAt.trim() ||
    !Number.isFinite(Date.parse(evidence.observedAt))
  ) {
    return { status: "HOLD", reason: "INVALID_RESULT" };
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
