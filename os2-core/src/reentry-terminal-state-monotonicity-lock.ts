import {
  REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
  type ReentryRecoveryTerminalObservation,
} from "./reentry-recovery-terminal-observation-guard.js";

/**
 * RE-ENTRY TERMINAL STATE MONOTONICITY LOCK v0.1
 *
 * Once recovery has been converted into a terminal observation, later reducers
 * must not reinterpret, upgrade, downgrade, or mutate that terminal meaning.
 * Exact replay of the same terminal observation is preserved; every other
 * proposed transition is denied or held closed.
 *
 * No backend exists anywhere in this API.
 */
export const REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION =
  "OS2_REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_V01" as const;

export type ReentryTerminalStateMonotonicityDecision =
  | {
      status: "PRESERVED";
      terminalStatus: ReentryRecoveryTerminalObservation["status"];
      transitionDisposition: "DO_NOT_TRANSITION";
      executionDisposition: "DO_NOT_EXECUTE";
      commitDisposition: "DO_NOT_COMMIT";
      retryDisposition: "DO_NOT_RETRY";
      lockVersion: typeof REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION;
    }
  | {
      status: "DENIED";
      fromStatus: ReentryRecoveryTerminalObservation["status"];
      attemptedStatus: string;
      reason: "TERMINAL_STATE_IS_IMMUTABLE";
      transitionDisposition: "DO_NOT_TRANSITION";
      executionDisposition: "DO_NOT_EXECUTE";
      commitDisposition: "DO_NOT_COMMIT";
      retryDisposition: "DO_NOT_RETRY";
      lockVersion: typeof REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION;
    }
  | {
      status: "HOLD";
      reason:
        | "CURRENT_TERMINAL_PROTOCOL_FAILURE"
        | "PROPOSED_TERMINAL_PROTOCOL_FAILURE";
      transitionDisposition: "DO_NOT_TRANSITION";
      executionDisposition: "DO_NOT_EXECUTE";
      commitDisposition: "DO_NOT_COMMIT";
      retryDisposition: "DO_NOT_RETRY";
      lockVersion: typeof REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION;
    };

function validTime(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function protocolValid(observation: unknown): observation is ReentryRecoveryTerminalObservation {
  if (typeof observation !== "object" || observation === null) return false;
  const value = observation as Record<string, unknown>;
  if (
    value.guardVersion !== REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION ||
    value.executionDisposition !== "DO_NOT_EXECUTE" ||
    value.commitDisposition !== "DO_NOT_COMMIT"
  ) {
    return false;
  }

  if (value.status === "TERMINAL_RESOLVED") {
    return (
      value.source === "DURABLE_RESOLUTION_RECEIPT" &&
      typeof value.authorityKey === "string" && value.authorityKey.length > 0 &&
      Number.isInteger(value.commitSequence) && (value.commitSequence as number) >= 0 &&
      typeof value.resultId === "string" && value.resultId.length > 0 &&
      typeof value.handoffId === "string" && value.handoffId.length > 0 &&
      typeof value.finalizedAt === "string" && validTime(value.finalizedAt)
    );
  }

  if (value.status === "TERMINAL_UNRESOLVED") {
    return value.reason === "RESOLUTION_RECEIPT_NOT_FOUND";
  }

  return (
    value.status === "TERMINAL_HOLD" &&
    typeof value.reason === "string" &&
    value.reason.length > 0
  );
}

function canonical(observation: ReentryRecoveryTerminalObservation): string {
  if (observation.status === "TERMINAL_RESOLVED") {
    return JSON.stringify([
      observation.status,
      observation.authorityKey,
      observation.commitSequence,
      observation.resultId,
      observation.handoffId,
      observation.finalizedAt,
      observation.executionDisposition,
      observation.commitDisposition,
      observation.source,
      observation.guardVersion,
    ]);
  }

  return JSON.stringify([
    observation.status,
    observation.reason,
    observation.executionDisposition,
    observation.commitDisposition,
    observation.guardVersion,
  ]);
}

export function lockReentryTerminalState(input: {
  current: ReentryRecoveryTerminalObservation;
  proposed: unknown;
}): ReentryTerminalStateMonotonicityDecision {
  if (!protocolValid(input.current)) {
    return {
      status: "HOLD",
      reason: "CURRENT_TERMINAL_PROTOCOL_FAILURE",
      transitionDisposition: "DO_NOT_TRANSITION",
      executionDisposition: "DO_NOT_EXECUTE",
      commitDisposition: "DO_NOT_COMMIT",
      retryDisposition: "DO_NOT_RETRY",
      lockVersion: REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION,
    };
  }

  if (!protocolValid(input.proposed)) {
    const attemptedStatus =
      typeof input.proposed === "object" && input.proposed !== null &&
      typeof (input.proposed as Record<string, unknown>).status === "string"
        ? ((input.proposed as Record<string, unknown>).status as string)
        : "INVALID";

    if (!attemptedStatus.startsWith("TERMINAL_")) {
      return {
        status: "DENIED",
        fromStatus: input.current.status,
        attemptedStatus,
        reason: "TERMINAL_STATE_IS_IMMUTABLE",
        transitionDisposition: "DO_NOT_TRANSITION",
        executionDisposition: "DO_NOT_EXECUTE",
        commitDisposition: "DO_NOT_COMMIT",
        retryDisposition: "DO_NOT_RETRY",
        lockVersion: REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION,
      };
    }

    return {
      status: "HOLD",
      reason: "PROPOSED_TERMINAL_PROTOCOL_FAILURE",
      transitionDisposition: "DO_NOT_TRANSITION",
      executionDisposition: "DO_NOT_EXECUTE",
      commitDisposition: "DO_NOT_COMMIT",
      retryDisposition: "DO_NOT_RETRY",
      lockVersion: REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION,
    };
  }

  if (canonical(input.current) !== canonical(input.proposed)) {
    return {
      status: "DENIED",
      fromStatus: input.current.status,
      attemptedStatus: input.proposed.status,
      reason: "TERMINAL_STATE_IS_IMMUTABLE",
      transitionDisposition: "DO_NOT_TRANSITION",
      executionDisposition: "DO_NOT_EXECUTE",
      commitDisposition: "DO_NOT_COMMIT",
      retryDisposition: "DO_NOT_RETRY",
      lockVersion: REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION,
    };
  }

  return {
    status: "PRESERVED",
    terminalStatus: input.current.status,
    transitionDisposition: "DO_NOT_TRANSITION",
    executionDisposition: "DO_NOT_EXECUTE",
    commitDisposition: "DO_NOT_COMMIT",
    retryDisposition: "DO_NOT_RETRY",
    lockVersion: REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION,
  };
}
