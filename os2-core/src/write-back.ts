import { assertSnapshotInvariant, type CurrentStateSnapshot } from "./current-state.js";
import type { ExecutionHandoffDecision, ExecutionHandoffRequest } from "./execution-handoff.js";
import type { ExecutionResultDecision, ExecutionResultEvidence } from "./execution-result-evidence.js";

export interface WriteBackParentBinding { parentStateId: string; parentRevision: number; }
export interface WriteBackSourceBinding { sourceResultId: string; sourceHandoffId: string; }
export interface WriteBackConsumptionBinding { resultConsumptionKey: string; handoffConsumptionKey: string; }
export interface WriteBackCasExpectation { expectedCurrentStateId: string; expectedCurrentRevision: number; }
export interface WriteBackProvenance { parent: WriteBackParentBinding; source: WriteBackSourceBinding; }
export type WriteBackCurrentStateCandidate = CurrentStateSnapshot & { writeBack: WriteBackProvenance };

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
  | { status: "HOLD"; reason:
      | "INVALID_WRITE_BACK" | "HANDOFF_NOT_READY" | "RESULT_NOT_ACCEPTED"
      | "INVALID_CANDIDATE" | "PROTECTED_STATE_MUTATION" | "PARENT_MISMATCH"
      | "SOURCE_BINDING_MISMATCH" | "REVISION_CONFLICT"
      | "RESULT_ALREADY_CONSUMED" | "HANDOFF_ALREADY_CONSUMED" };

export interface WriteBackAtomicCommit {
  expectedCurrent: WriteBackCasExpectation;
  consumeResultId: string;
  consumeHandoffId: string;
  nextCurrent: WriteBackCurrentStateCandidate;
}

export interface WriteBackEvaluationInput {
  current: CurrentStateSnapshot;
  handoff: ExecutionHandoffRequest;
  handoffDecision: ExecutionHandoffDecision;
  result: ExecutionResultEvidence;
  resultDecision: ExecutionResultDecision;
  consumedResultIds: ReadonlySet<string>;
  consumedHandoffIds: ReadonlySet<string>;
}

function sameValue(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

/** WRITE BACK consumes upstream decisions; it must not recreate authority from raw data. */
export function evaluateWriteBack(input: WriteBackEvaluationInput, request: WriteBackRequest): WriteBackDecision {
  const { current, handoff, result } = input;

  if (input.handoffDecision.status !== "READY") return { status: "HOLD", reason: "HANDOFF_NOT_READY" };
  if (input.resultDecision.status !== "ACCEPTED") return { status: "HOLD", reason: "RESULT_NOT_ACCEPTED" };

  try { assertSnapshotInvariant(request.candidate); }
  catch { return { status: "HOLD", reason: "INVALID_CANDIDATE" }; }

  if (!request.writeBackId.trim() || !request.parent.parentStateId.trim() ||
      !request.source.sourceResultId.trim() || !request.source.sourceHandoffId.trim() ||
      !request.consumption.resultConsumptionKey.trim() || !request.consumption.handoffConsumptionKey.trim() ||
      !request.cas.expectedCurrentStateId.trim()) return { status: "HOLD", reason: "INVALID_WRITE_BACK" };

  if (request.parent.parentStateId !== current.identity.stateId ||
      request.parent.parentRevision !== current.identity.stateRevision ||
      request.candidate.writeBack.parent.parentStateId !== request.parent.parentStateId ||
      request.candidate.writeBack.parent.parentRevision !== request.parent.parentRevision)
    return { status: "HOLD", reason: "PARENT_MISMATCH" };

  if (request.source.sourceResultId !== result.resultId || request.source.sourceHandoffId !== handoff.handoffId ||
      result.handoffId !== handoff.handoffId || result.sourceStateId !== current.identity.stateId ||
      result.sourceStateRevision !== current.identity.stateRevision || handoff.sourceStateId !== current.identity.stateId ||
      handoff.sourceStateRevision !== current.identity.stateRevision ||
      request.candidate.writeBack.source.sourceResultId !== request.source.sourceResultId ||
      request.candidate.writeBack.source.sourceHandoffId !== request.source.sourceHandoffId ||
      request.consumption.resultConsumptionKey !== result.resultId ||
      request.consumption.handoffConsumptionKey !== handoff.handoffId)
    return { status: "HOLD", reason: "SOURCE_BINDING_MISMATCH" };

  if (input.consumedResultIds.has(result.resultId)) return { status: "HOLD", reason: "RESULT_ALREADY_CONSUMED" };
  if (input.consumedHandoffIds.has(handoff.handoffId)) return { status: "HOLD", reason: "HANDOFF_ALREADY_CONSUMED" };

  if (request.cas.expectedCurrentStateId !== current.identity.stateId ||
      request.cas.expectedCurrentRevision !== current.identity.stateRevision)
    return { status: "HOLD", reason: "REVISION_CONFLICT" };

  if (request.candidate.identity.stateId !== request.parent.parentStateId ||
      request.candidate.identity.stateRevision !== request.parent.parentRevision + 1 ||
      request.candidate.identity.lineageId !== current.identity.lineageId ||
      request.candidate.identity.scope !== current.identity.scope)
    return { status: "HOLD", reason: "REVISION_CONFLICT" };

  if (request.candidate.identity.schemaVersion !== current.identity.schemaVersion ||
      !sameValue(request.candidate.humanDecisionFinal, current.humanDecisionFinal) ||
      !sameValue(request.candidate.mainLineTask, current.mainLineTask) ||
      !sameValue(request.candidate.nextActionSingle, current.nextActionSingle) ||
      !sameValue(request.candidate.activeRolesAndAuthority, current.activeRolesAndAuthority) ||
      !sameValue(request.candidate.activeGuards, current.activeGuards) ||
      !sameValue(request.candidate.confirmedRefIndex, current.confirmedRefIndex) ||
      !sameValue(request.candidate.independentLaneHealth, current.independentLaneHealth))
    return { status: "HOLD", reason: "PROTECTED_STATE_MUTATION" };

  return { status: "READY", request };
}

/** Storage adapter must atomically compare current + consume IDs + replace CURRENT. */
export function toWriteBackAtomicCommit(request: WriteBackRequest): WriteBackAtomicCommit {
  return { expectedCurrent: request.cas, consumeResultId: request.source.sourceResultId,
    consumeHandoffId: request.source.sourceHandoffId, nextCurrent: request.candidate };
}
