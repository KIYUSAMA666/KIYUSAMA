import {
  REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
  type ReentryRecoveryTerminalObservation,
} from "./reentry-recovery-terminal-observation-guard.js";

/**
 * RE-ENTRY TERMINAL NON-ESCALATION GATE v0.1
 *
 * Terminal recovery observations are evidence only. They must never be used as
 * ingredients for a new lease, retry, execution, commit, consume, close, or
 * write capability. This gate converts every valid terminal observation plus
 * any attempted privilege escalation into an explicit denial.
 *
 * No backend exists anywhere in this API.
 */
export const REENTRY_TERMINAL_NON_ESCALATION_GATE_VERSION =
  "OS2_REENTRY_TERMINAL_NON_ESCALATION_GATE_V01" as const;

export type ReentryTerminalEscalationAttempt =
  | "CLAIM_LEASE"
  | "RETRY"
  | "EXECUTE"
  | "COMMIT"
  | "CONSUME"
  | "CLOSE"
  | "WRITE";

export type ReentryTerminalNonEscalationDecision =
  | {
      status: "DENIED";
      terminalStatus: ReentryRecoveryTerminalObservation["status"];
      attemptedOperation: ReentryTerminalEscalationAttempt;
      reason: "TERMINAL_OBSERVATION_CANNOT_ESCALATE";
      executionDisposition: "DO_NOT_EXECUTE";
      commitDisposition: "DO_NOT_COMMIT";
      retryDisposition: "DO_NOT_RETRY";
      gateVersion: typeof REENTRY_TERMINAL_NON_ESCALATION_GATE_VERSION;
    }
  | {
      status: "HOLD";
      reason: "TERMINAL_OBSERVATION_PROTOCOL_FAILURE";
      executionDisposition: "DO_NOT_EXECUTE";
      commitDisposition: "DO_NOT_COMMIT";
      retryDisposition: "DO_NOT_RETRY";
      gateVersion: typeof REENTRY_TERMINAL_NON_ESCALATION_GATE_VERSION;
    };

function validTime(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function commonValid(observation: ReentryRecoveryTerminalObservation): boolean {
  return (
    observation.guardVersion === REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION &&
    observation.executionDisposition === "DO_NOT_EXECUTE" &&
    observation.commitDisposition === "DO_NOT_COMMIT"
  );
}

function protocolValid(observation: ReentryRecoveryTerminalObservation): boolean {
  if (!commonValid(observation)) return false;

  if (observation.status === "TERMINAL_RESOLVED") {
    return (
      observation.source === "DURABLE_RESOLUTION_RECEIPT" &&
      typeof observation.authorityKey === "string" && observation.authorityKey.length > 0 &&
      Number.isInteger(observation.commitSequence) && observation.commitSequence >= 0 &&
      typeof observation.resultId === "string" && observation.resultId.length > 0 &&
      typeof observation.handoffId === "string" && observation.handoffId.length > 0 &&
      validTime(observation.finalizedAt)
    );
  }

  if (observation.status === "TERMINAL_UNRESOLVED") {
    return observation.reason === "RESOLUTION_RECEIPT_NOT_FOUND";
  }

  return (
    observation.status === "TERMINAL_HOLD" &&
    typeof observation.reason === "string" &&
    observation.reason.length > 0
  );
}

export function denyReentryTerminalEscalation(input: {
  observation: ReentryRecoveryTerminalObservation;
  attemptedOperation: ReentryTerminalEscalationAttempt;
}): ReentryTerminalNonEscalationDecision {
  if (!protocolValid(input.observation)) {
    return {
      status: "HOLD",
      reason: "TERMINAL_OBSERVATION_PROTOCOL_FAILURE",
      executionDisposition: "DO_NOT_EXECUTE",
      commitDisposition: "DO_NOT_COMMIT",
      retryDisposition: "DO_NOT_RETRY",
      gateVersion: REENTRY_TERMINAL_NON_ESCALATION_GATE_VERSION,
    };
  }

  return {
    status: "DENIED",
    terminalStatus: input.observation.status,
    attemptedOperation: input.attemptedOperation,
    reason: "TERMINAL_OBSERVATION_CANNOT_ESCALATE",
    executionDisposition: "DO_NOT_EXECUTE",
    commitDisposition: "DO_NOT_COMMIT",
    retryDisposition: "DO_NOT_RETRY",
    gateVersion: REENTRY_TERMINAL_NON_ESCALATION_GATE_VERSION,
  };
}
