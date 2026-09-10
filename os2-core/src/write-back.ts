import type { CurrentStateSnapshot } from "./current-state.js";
import type { ExecutionHandoffRequest } from "./execution-handoff.js";
import type { ExecutionResultEvidence } from "./execution-result-evidence.js";

/**
 * WRITE BACK v0.1 scope:
 * 1. Bind the new CURRENT to its exact parent state/revision.
 * 2. Bind the new CURRENT back to the accepted result/handoff that justified it.
 * 3. Carry explicit consumption keys so the same result/handoff cannot authorize a second write.
 * 4. Carry an expected-current compare target for storage-layer CAS.
 *
 * Trust Anchor / Provenance Verification is intentionally NOT solved here.
 * It remains a separate OPEN/HOLD pillar and must not be inferred from these bindings.
 */

export interface WriteBackParentBinding {
  parentStateId: string;
  parentRevision: number;
}

export interface WriteBackSourceBinding {
  sourceResultId: string;
  sourceHandoffId: string;
}

export interface WriteBackConsumptionBinding {
  resultConsumptionKey: string;
  handoffConsumptionKey: string;
}

export interface WriteBackCasExpectation {
  expectedCurrentStateId: string;
  expectedCurrentRevision: number;
}

export interface WriteBackProvenance {
  parent: WriteBackParentBinding;
  source: WriteBackSourceBinding;
}

/**
 * Candidate CURRENT produced by WRITE BACK.
 * The base CurrentStateSnapshot contract remains unchanged/locked;
 * WRITE BACK adds explicit ancestry/source provenance to the produced candidate.
 */
export type WriteBackCurrentStateCandidate = CurrentStateSnapshot & {
  writeBack: WriteBackProvenance;
};

export interface WriteBackRequest {
  writeBackId: string;
  parent: WriteBackParentBinding;
  source: WriteBackSourceBinding;
  consumption: WriteBackConsumptionBinding;
  cas: WriteBackCasExpectation;
  candidate: WriteBackCurrentStateCandidate;
}

export type WriteBackDecision =
  | { status: "READY"; request: WriteBackRequest }
  | {
      status: "HOLD";
      reason:
        | "INVALID_WRITE_BACK"
        | "PARENT_MISMATCH"
        | "SOURCE_BINDING_MISMATCH"
        | "REVISION_CONFLICT"
        | "RESULT_ALREADY_CONSUMED"
        | "HANDOFF_ALREADY_CONSUMED";
    };

/**
 * Storage contract required by WRITE BACK v0.1.
 * Implementations must make current-revision comparison, consumption claims,
 * and CURRENT replacement one atomic commit boundary (CAS-equivalent).
 */
export interface WriteBackAtomicCommit {
  expectedCurrent: WriteBackCasExpectation;
  consumeResultId: string;
  consumeHandoffId: string;
  nextCurrent: WriteBackCurrentStateCandidate;
}

export interface WriteBackEvaluationInput {
  current: CurrentStateSnapshot;
  handoff: ExecutionHandoffRequest;
  result: ExecutionResultEvidence;
  consumedResultIds: ReadonlySet<string>;
  consumedHandoffIds: ReadonlySet<string>;
}

/**
 * Pure pre-commit validation for WRITE BACK v0.1.
 *
 * This function does NOT itself make the storage write atomic. A storage adapter
 * must still execute the returned WriteBackAtomicCommit as one CAS-equivalent
 * transaction: compare current, claim result/handoff consumption, replace CURRENT.
 */
export function evaluateWriteBack(
  input: WriteBackEvaluationInput,
  request: WriteBackRequest,
): WriteBackDecision {
  const { current, handoff, result } = input;

  if (
    !request.writeBackId.trim() ||
    !request.parent.parentStateId.trim() ||
    !request.source.sourceResultId.trim() ||
    !request.source.sourceHandoffId.trim() ||
    !request.consumption.resultConsumptionKey.trim() ||
    !request.consumption.handoffConsumptionKey.trim() ||
    !request.cas.expectedCurrentStateId.trim()
  ) {
    return { status: "HOLD", reason: "INVALID_WRITE_BACK" };
  }

  if (
    request.parent.parentStateId !== current.identity.stateId ||
    request.parent.parentRevision !== current.identity.stateRevision ||
    request.candidate.writeBack.parent.parentStateId !== request.parent.parentStateId ||
    request.candidate.writeBack.parent.parentRevision !== request.parent.parentRevision
  ) {
    return { status: "HOLD", reason: "PARENT_MISMATCH" };
  }

  if (
    request.source.sourceResultId !== result.resultId ||
    request.source.sourceHandoffId !== handoff.handoffId ||
    result.handoffId !== handoff.handoffId ||
    result.sourceStateId !== current.identity.stateId ||
    result.sourceStateRevision !== current.identity.stateRevision ||
    handoff.sourceStateId !== current.identity.stateId ||
    handoff.sourceStateRevision !== current.identity.stateRevision ||
    request.candidate.writeBack.source.sourceResultId !== request.source.sourceResultId ||
    request.candidate.writeBack.source.sourceHandoffId !== request.source.sourceHandoffId ||
    request.consumption.resultConsumptionKey !== result.resultId ||
    request.consumption.handoffConsumptionKey !== handoff.handoffId
  ) {
    return { status: "HOLD", reason: "SOURCE_BINDING_MISMATCH" };
  }

  if (input.consumedResultIds.has(result.resultId)) {
    return { status: "HOLD", reason: "RESULT_ALREADY_CONSUMED" };
  }

  if (input.consumedHandoffIds.has(handoff.handoffId)) {
    return { status: "HOLD", reason: "HANDOFF_ALREADY_CONSUMED" };
  }

  if (
    request.cas.expectedCurrentStateId !== current.identity.stateId ||
    request.cas.expectedCurrentRevision !== current.identity.stateRevision
  ) {
    return { status: "HOLD", reason: "REVISION_CONFLICT" };
  }

  if (
    request.candidate.identity.stateId !== request.parent.parentStateId ||
    request.candidate.identity.stateRevision !== request.parent.parentRevision + 1 ||
    request.candidate.identity.lineageId !== current.identity.lineageId ||
    request.candidate.identity.scope !== current.identity.scope
  ) {
    return { status: "HOLD", reason: "REVISION_CONFLICT" };
  }

  return { status: "READY", request };
}

export function toWriteBackAtomicCommit(request: WriteBackRequest): WriteBackAtomicCommit {
  return {
    expectedCurrent: request.cas,
    consumeResultId: request.source.sourceResultId,
    consumeHandoffId: request.source.sourceHandoffId,
    nextCurrent: request.candidate,
  };
}
