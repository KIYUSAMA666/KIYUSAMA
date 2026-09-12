import type { ReentryResolutionReceiptRecoveryDecision } from "./reentry-resolution-receipt-recovery.js";

/**
 * RE-ENTRY RECOVERY TERMINAL OBSERVATION GUARD v0.1
 *
 * A recovered RESOLVED decision is evidence about past execution, never fresh
 * authority for another execution. This guard converts recovery output into a
 * terminal observation state that carries no execution/commit capability.
 *
 * No commit, retry, lease claim, execution, consume, close, or write backend
 * exists anywhere in this API.
 */
export const REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION =
  "OS2_REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_V01" as const;

export type ReentryRecoveryTerminalObservation =
  | {
      status: "TERMINAL_RESOLVED";
      authorityKey: string;
      commitSequence: number;
      resultId: string;
      handoffId: string;
      finalizedAt: string;
      executionDisposition: "DO_NOT_EXECUTE";
      commitDisposition: "DO_NOT_COMMIT";
      source: "DURABLE_RESOLUTION_RECEIPT";
      guardVersion: typeof REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION;
    }
  | {
      status: "TERMINAL_UNRESOLVED";
      reason: "RESOLUTION_RECEIPT_NOT_FOUND";
      executionDisposition: "DO_NOT_EXECUTE";
      commitDisposition: "DO_NOT_COMMIT";
      guardVersion: typeof REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION;
    }
  | {
      status: "TERMINAL_HOLD";
      reason: string;
      executionDisposition: "DO_NOT_EXECUTE";
      commitDisposition: "DO_NOT_COMMIT";
      guardVersion: typeof REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION;
    };

function validTime(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function toReentryRecoveryTerminalObservation(
  decision: ReentryResolutionReceiptRecoveryDecision,
): ReentryRecoveryTerminalObservation {
  if (decision.status === "RESOLVED") {
    if (
      decision.source !== "DURABLE_RESOLUTION_RECEIPT" ||
      typeof decision.authorityKey !== "string" || decision.authorityKey.length === 0 ||
      !Number.isInteger(decision.commitSequence) || decision.commitSequence < 0 ||
      typeof decision.resultId !== "string" || decision.resultId.length === 0 ||
      typeof decision.handoffId !== "string" || decision.handoffId.length === 0 ||
      !validTime(decision.finalizedAt)
    ) {
      return {
        status: "TERMINAL_HOLD",
        reason: "RECOVERY_DECISION_PROTOCOL_FAILURE",
        executionDisposition: "DO_NOT_EXECUTE",
        commitDisposition: "DO_NOT_COMMIT",
        guardVersion: REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
      };
    }

    return {
      status: "TERMINAL_RESOLVED",
      authorityKey: decision.authorityKey,
      commitSequence: decision.commitSequence,
      resultId: decision.resultId,
      handoffId: decision.handoffId,
      finalizedAt: decision.finalizedAt,
      executionDisposition: "DO_NOT_EXECUTE",
      commitDisposition: "DO_NOT_COMMIT",
      source: "DURABLE_RESOLUTION_RECEIPT",
      guardVersion: REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
    };
  }

  if (decision.status === "UNRESOLVED") {
    return {
      status: "TERMINAL_UNRESOLVED",
      reason: "RESOLUTION_RECEIPT_NOT_FOUND",
      executionDisposition: "DO_NOT_EXECUTE",
      commitDisposition: "DO_NOT_COMMIT",
      guardVersion: REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
    };
  }

  return {
    status: "TERMINAL_HOLD",
    reason: decision.reason,
    executionDisposition: "DO_NOT_EXECUTE",
    commitDisposition: "DO_NOT_COMMIT",
    guardVersion: REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
  };
}
