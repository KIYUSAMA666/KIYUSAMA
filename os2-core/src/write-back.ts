import { assertSnapshotInvariant, type CurrentStateSnapshot } from "./current-state.js";
import {
  isVerifiedExecutionHandoffReceipt,
  type ExecutionHandoffRequest,
  type VerifiedExecutionHandoffReceipt,
} from "./execution-handoff.js";
import {
  isAcceptedExecutionResultReceipt,
  type AcceptedExecutionResultReceipt,
  type ExecutionResultEvidence,
} from "./execution-result-evidence.js";

/**
 * WRITE BACK v0.1 scope:
 * 1. Bind the new CURRENT to its exact parent state/revision.
 * 2. Bind the new CURRENT back to the accepted result/handoff that justified it.
 * 3. Carry explicit consumption keys so the same result/handoff cannot authorize a second write.
 * 4. Carry an expected-current compare target for storage-layer CAS.
 * 5. Require in-process receipts proving Handoff READY and Result ACCEPTED were actually evaluated.
 * 6. Keep authority/control fields immutable in WRITE BACK v0.1.
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
        | "HANDOFF_NOT_READY"
        | "RESULT_NOT_ACCEPTED"
        | "PARENT_MISMATCH"
        | "SOURCE_BINDING_MISMATCH"
        | "REVISION_CONFLICT"
        | "CANDIDATE_INVARIANT_FAILED"
        | "UNAUTHORIZED_STATE_MUTATION"
        | "RESULT_ALREADY_CONSUMED"
        | "HANDOFF_ALREADY_CONSUMED";
    };

export interface WriteBackAtomicCommit {
  expectedCurrent: WriteBackCasExpectation;
  consumeResultId: string;
  consumeHandoffId: string;
  nextCurrent: WriteBackCurrentStateCandidate;
}

export interface WriteBackEvaluationInput {
  current: CurrentStateSnapshot;
  handoff: ExecutionHandoffRequest;
  handoffReceipt: VerifiedExecutionHandoffReceipt;
  result: ExecutionResultEvidence;
  resultReceipt: AcceptedExecutionResultReceipt;
  consumedResultIds: ReadonlySet<string>;
  consumedHandoffIds: ReadonlySet<string>;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function preservesWriteBackImmutableState(
  current: CurrentStateSnapshot,
  candidate: WriteBackCurrentStateCandidate,
): boolean {
  return (
    candidate.identity.schemaVersion === current.identity.schemaVersion &&
    sameJson(candidate.humanDecisionFinal, current.humanDecisionFinal) &&
    sameJson(candidate.mainLineTask, current.mainLineTask) &&
    sameJson(candidate.nextActionSingle, current.nextActionSingle) &&
    sameJson(candidate.activeRolesAndAuthority, current.activeRolesAndAuthority) &&
    sameJson(candidate.activeGuards, current.activeGuards) &&
    sameJson(candidate.confirmedRefIndex, current.confirmedRefIndex) &&
    sameJson(candidate.independentLaneHealth, current.independentLaneHealth)
  );
}

export function evaluateWriteBack(
  input: WriteBackEvaluationInput,
  request: WriteBackRequest,
): WriteBackDecision {
  const { current, handoff, result } = input;

  if (!isVerifiedExecutionHandoffReceipt(input.handoffReceipt, handoff)) {
    return { status: "HOLD", reason: "HANDOFF_NOT_READY" };
  }

  if (!isAcceptedExecutionResultReceipt(input.resultReceipt, result)) {
    return { status: "HOLD", reason: "RESULT_NOT_ACCEPTED" };
  }

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

  try {
    assertSnapshotInvariant(request.candidate);
  } catch {
    return { status: "HOLD", reason: "CANDIDATE_INVARIANT_FAILED" };
  }

  const parentEffectiveAtMs = Date.parse(current.identity.effectiveAt);
  const candidateEffectiveAtMs = Date.parse(request.candidate.identity.effectiveAt);
  if (
    !Number.isFinite(parentEffectiveAtMs) ||
    !Number.isFinite(candidateEffectiveAtMs) ||
    candidateEffectiveAtMs < parentEffectiveAtMs
  ) {
    return { status: "HOLD", reason: "CANDIDATE_INVARIANT_FAILED" };
  }

  if (!preservesWriteBackImmutableState(current, request.candidate)) {
    return { status: "HOLD", reason: "UNAUTHORIZED_STATE_MUTATION" };
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
