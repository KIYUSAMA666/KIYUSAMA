import { evaluateActionEvidenceRequirement, type ActionEvidenceRequirement } from "./action-evidence-requirement.js";
import type { CapabilitySlot } from "./capability-slot.js";
import type { CurrentStateSnapshot } from "./current-state.js";
import { evaluateExecutionHandoff, type ExecutionHandoffRequest } from "./execution-handoff.js";
import { evaluateExecutionResultEvidence, type ExecutionResultEvidence } from "./execution-result-evidence.js";
import { selectExecutionCandidate, type MemoryRecord } from "./memory-selection.js";
import { evaluatePreExecutionGate } from "./pre-execution-gate.js";
import { evaluateProvenanceVerification, type ProvenanceVerificationInput } from "./trust-anchor-provenance.js";
import {
  evaluateWriteBack,
  toWriteBackAtomicCommit,
  type WriteBackAtomicCommit,
  type WriteBackRequest,
} from "./write-back.js";

/**
 * END-TO-END TRUST PIPELINE v0.1
 *
 * This module does not replace any locked pillar. It composes them in one fail-closed path
 * so callers cannot skip provenance verification between individually-correct components.
 *
 * Order:
 * CURRENT memory selection
 * -> pre-execution external provenance of CURRENT refs/lane
 * -> action evidence
 * -> pre-execution gate
 * -> execution handoff
 * -> execution result evidence
 * -> post-execution external provenance of result refs/lane/verifier
 * -> WRITE BACK pre-commit validation
 * -> atomic commit projection
 */

export type EndToEndTrustPipelineStage =
  | "MEMORY_SELECTION"
  | "PRE_EXECUTION_TRUST"
  | "ACTION_EVIDENCE"
  | "PRE_EXECUTION_GATE"
  | "EXECUTION_HANDOFF"
  | "EXECUTION_RESULT"
  | "POST_EXECUTION_TRUST"
  | "WRITE_BACK";

export type EndToEndTrustPipelineDecision =
  | {
      status: "READY_TO_COMMIT";
      atomicCommit: WriteBackAtomicCommit;
    }
  | {
      status: "HOLD";
      stage: EndToEndTrustPipelineStage;
      reason: string;
    };

export interface EndToEndTrustPipelineInput<T = unknown> {
  snapshot: CurrentStateSnapshot;
  memoryRecord: MemoryRecord<T>;
  actionEvidenceRequirement: ActionEvidenceRequirement;
  requiredCapabilityId: string;
  capabilitySlot: CapabilitySlot;
  handoff: ExecutionHandoffRequest;
  result: ExecutionResultEvidence;
  provenance: Omit<ProvenanceVerificationInput, "current" | "result">;
  writeBackRequest: WriteBackRequest;
  consumedResultIds: ReadonlySet<string>;
  consumedHandoffIds: ReadonlySet<string>;
  now: string;
}

export function evaluateEndToEndTrustPipeline<T = unknown>(
  input: EndToEndTrustPipelineInput<T>,
): EndToEndTrustPipelineDecision {
  const memoryDecision = selectExecutionCandidate(input.memoryRecord);
  if (memoryDecision.status !== "EXECUTION_CANDIDATE") {
    return { status: "HOLD", stage: "MEMORY_SELECTION", reason: memoryDecision.reason };
  }

  const preExecutionTrust = evaluateProvenanceVerification({
    ...input.provenance,
    current: input.snapshot,
    result: null,
  });
  if (preExecutionTrust.status !== "VERIFIED") {
    return {
      status: "HOLD",
      stage: "PRE_EXECUTION_TRUST",
      reason: preExecutionTrust.reason,
    };
  }

  const actionEvidenceDecision = evaluateActionEvidenceRequirement({
    requirement: input.actionEvidenceRequirement,
    snapshot: input.snapshot,
  });
  if (actionEvidenceDecision.status !== "SATISFIED") {
    return {
      status: "HOLD",
      stage: "ACTION_EVIDENCE",
      reason: actionEvidenceDecision.reason,
    };
  }

  const gateDecision = evaluatePreExecutionGate({
    actionId: input.handoff.actionId,
    snapshot: input.snapshot,
    memoryDecision,
    actionEvidenceDecision,
    requiredCapabilityId: input.requiredCapabilityId,
    capabilitySlot: input.capabilitySlot,
  });
  if (gateDecision.status !== "ALLOW") {
    return { status: "HOLD", stage: "PRE_EXECUTION_GATE", reason: gateDecision.reason };
  }

  const handoffDecision = evaluateExecutionHandoff(
    {
      snapshot: input.snapshot,
      actionEvidenceRequirement: input.actionEvidenceRequirement,
      capabilitySlot: input.capabilitySlot,
      gateDecision,
    },
    input.handoff,
    input.now,
  );
  if (handoffDecision.status !== "READY") {
    return { status: "HOLD", stage: "EXECUTION_HANDOFF", reason: handoffDecision.reason };
  }

  const resultDecision = evaluateExecutionResultEvidence({
    snapshot: input.snapshot,
    handoff: input.handoff,
    evidence: input.result,
  });
  if (resultDecision.status !== "ACCEPTED") {
    return { status: "HOLD", stage: "EXECUTION_RESULT", reason: resultDecision.reason };
  }

  const postExecutionTrust = evaluateProvenanceVerification({
    ...input.provenance,
    current: input.snapshot,
    result: input.result,
  });
  if (postExecutionTrust.status !== "VERIFIED") {
    return {
      status: "HOLD",
      stage: "POST_EXECUTION_TRUST",
      reason: postExecutionTrust.reason,
    };
  }

  const writeBackDecision = evaluateWriteBack(
    {
      current: input.snapshot,
      handoff: input.handoff,
      result: input.result,
      consumedResultIds: input.consumedResultIds,
      consumedHandoffIds: input.consumedHandoffIds,
    },
    input.writeBackRequest,
  );
  if (writeBackDecision.status !== "READY") {
    return { status: "HOLD", stage: "WRITE_BACK", reason: writeBackDecision.reason };
  }

  return {
    status: "READY_TO_COMMIT",
    atomicCommit: toWriteBackAtomicCommit(writeBackDecision.request),
  };
}
