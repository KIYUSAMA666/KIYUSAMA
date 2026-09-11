import type { ActionEvidenceDecision } from "./action-evidence-requirement.js";
import type { CapabilitySlot } from "./capability-slot.js";
import type { DurableCurrentRecoveryDecision } from "./durable-current-recovery.js";
import type { CandidateDecision } from "./memory-selection.js";
import {
  evaluatePreExecutionGate,
  type PreExecutionHoldReason,
} from "./pre-execution-gate.js";

export interface RecoveryReentryAttestation {
  attestationId?: string;
  stateId: string;
  lineageId: string;
  stateRevision: number;
  commitSequence: number;
  status: "VERIFIED" | "HOLD" | "FAIL";
  evidenceVerdict: "SUFFICIENT" | "INSUFFICIENT" | "CONFLICT";
  observedAt: string;
  evidenceSource: string;
}

export interface RecoveryReentryGateInput<T = unknown> {
  recovery: DurableCurrentRecoveryDecision;
  attestation: RecoveryReentryAttestation;
  now: string;
  maxAttestationAgeMs: number;
  memoryDecision: CandidateDecision<T>;
  actionEvidenceDecision: ActionEvidenceDecision;
  requiredCapabilityId?: string;
  capabilitySlot?: CapabilitySlot;
}

export type RecoveryReentryHoldReason =
  | "RECOVERY_NOT_READY"
  | "ATTESTATION_NOT_READY"
  | "ATTESTATION_BINDING_MISMATCH"
  | "ATTESTATION_TIME_INVALID"
  | "ATTESTATION_FROM_FUTURE"
  | "ATTESTATION_STALE"
  | "PRE_EXECUTION_HOLD";

export type RecoveryReentryGateDecision =
  | {
      status: "ALLOW";
      actionId: string;
      stateId: string;
      stateRevision: number;
      commitSequence: number;
      attestationId: string | null;
      attestationObservedAt: string;
      attestationSource: string;
      reentryAuthorityExpiresAt: string;
    }
  | {
      status: "HOLD";
      reason: RecoveryReentryHoldReason;
      preExecutionReason?: PreExecutionHoldReason;
    };

function parseFiniteTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A durable CURRENT recovered after restart is data, not fresh execution authority.
 * Re-entry therefore requires a fresh, independently supplied attestation bound to
 * the exact recovered state/revision/commitSequence before the ordinary
 * pre-execution gate may allow the next action.
 */
export function evaluateRecoveryReentryGate<T = unknown>(
  input: RecoveryReentryGateInput<T>,
): RecoveryReentryGateDecision {
  if (input.recovery.status !== "RECOVERED") {
    return { status: "HOLD", reason: "RECOVERY_NOT_READY" };
  }

  const { current, commitSequence } = input.recovery;
  const attestation = input.attestation;

  if (
    attestation.status !== "VERIFIED" ||
    attestation.evidenceVerdict !== "SUFFICIENT" ||
    !attestation.evidenceSource.trim()
  ) {
    return { status: "HOLD", reason: "ATTESTATION_NOT_READY" };
  }

  if (
    attestation.stateId !== current.identity.stateId ||
    attestation.lineageId !== current.identity.lineageId ||
    attestation.stateRevision !== current.identity.stateRevision ||
    attestation.commitSequence !== commitSequence
  ) {
    return { status: "HOLD", reason: "ATTESTATION_BINDING_MISMATCH" };
  }

  if (!Number.isInteger(input.maxAttestationAgeMs) || input.maxAttestationAgeMs < 0) {
    return { status: "HOLD", reason: "ATTESTATION_TIME_INVALID" };
  }

  const nowMs = parseFiniteTime(input.now);
  const observedMs = parseFiniteTime(attestation.observedAt);
  if (nowMs === null || observedMs === null) {
    return { status: "HOLD", reason: "ATTESTATION_TIME_INVALID" };
  }
  if (observedMs > nowMs) {
    return { status: "HOLD", reason: "ATTESTATION_FROM_FUTURE" };
  }
  if (nowMs - observedMs > input.maxAttestationAgeMs) {
    return { status: "HOLD", reason: "ATTESTATION_STALE" };
  }

  const authorityExpiresAtMs = observedMs + input.maxAttestationAgeMs;
  if (!Number.isFinite(authorityExpiresAtMs)) {
    return { status: "HOLD", reason: "ATTESTATION_TIME_INVALID" };
  }

  const preExecution = evaluatePreExecutionGate({
    actionId: current.nextActionSingle.actionId,
    snapshot: current,
    memoryDecision: input.memoryDecision,
    actionEvidenceDecision: input.actionEvidenceDecision,
    requiredCapabilityId: input.requiredCapabilityId,
    capabilitySlot: input.capabilitySlot,
  });

  if (preExecution.status !== "ALLOW") {
    return {
      status: "HOLD",
      reason: "PRE_EXECUTION_HOLD",
      preExecutionReason: preExecution.reason,
    };
  }

  return {
    status: "ALLOW",
    actionId: preExecution.actionId,
    stateId: preExecution.stateId,
    stateRevision: preExecution.stateRevision,
    commitSequence,
    attestationId:
      typeof attestation.attestationId === "string" && attestation.attestationId.trim()
        ? attestation.attestationId
        : null,
    attestationObservedAt: attestation.observedAt,
    attestationSource: attestation.evidenceSource,
    reentryAuthorityExpiresAt: new Date(authorityExpiresAtMs).toISOString(),
  };
}
