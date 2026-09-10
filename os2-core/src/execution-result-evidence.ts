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
