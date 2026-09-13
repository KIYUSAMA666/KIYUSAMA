import {
  isVerifiedExecutionHandoffReceipt,
  type ExecutionHandoffRequest,
  type VerifiedExecutionHandoffReceipt,
} from "./execution-handoff.js";
import {
  assertSnapshotInvariant,
  type CurrentStateSnapshot,
} from "./current-state.js";

/**
 * SIDE-EFFECT FENCE / EXECUTION CONTROL v0.1
 *
 * Converts an already-verified execution handoff into a narrowly-bound egress
 * permit. The permit is bound to a freshly loaded CURRENT snapshot, worker
 * identity, worker epoch, generation, capability, target and operation.
 *
 * IMPORTANT RUNTIME BOUNDARY:
 * VerifiedSideEffectPermit is intentionally IN_PROCESS_ONLY. Authenticity is
 * tracked with object identity in a WeakSet. Serialization, process restart,
 * queue transfer, or another gateway worker invalidates the permit. A future
 * cross-process design must use a separately authenticated durable/signed
 * permit rather than weakening this check.
 */

export const MAX_EGRESS_PERMIT_TTL_MS = 5 * 60 * 1000;
export const SIDE_EFFECT_PERMIT_RUNTIME_SCOPE = "IN_PROCESS_ONLY" as const;

export type SideEffectClass =
  | "EXTERNAL_MUTATION"
  | "EXTERNAL_MESSAGE"
  | "PRODUCTION_WRITE";

export interface WorkerExecutionBinding {
  workerId: string;
  workerEpoch: number;
  generation: number;
}

export interface CurrentStateProvider {
  readCurrentState(): CurrentStateSnapshot;
}

export interface SideEffectIntent {
  permitId: string;
  handoffId: string;
  actionId: string;
  sourceStateId: string;
  sourceStateRevision: number;
  capabilityId: string;
  workerId: string;
  workerEpoch: number;
  generation: number;
  effectClass: SideEffectClass;
  target: string;
  operation: string;
  issuedAt: string;
  expiresAt: string;
}

export type SideEffectFenceHoldReason =
  | "HANDOFF_NOT_VERIFIED"
  | "CURRENT_PROVIDER_FAILURE"
  | "CURRENT_BINDING_MISMATCH"
  | "HANDOFF_BINDING_MISMATCH"
  | "WORKER_BINDING_INVALID"
  | "WORKER_EPOCH_MISMATCH"
  | "GENERATION_MISMATCH"
  | "EGRESS_BINDING_INVALID"
  | "INVALID_LIFETIME"
  | "EXPIRED";

export interface VerifiedSideEffectPermit {
  readonly status: "PERMIT";
  readonly runtimeScope: typeof SIDE_EFFECT_PERMIT_RUNTIME_SCOPE;
  readonly permitId: string;
  readonly handoffId: string;
  readonly actionId: string;
  readonly sourceStateId: string;
  readonly sourceStateRevision: number;
  readonly capabilityId: string;
  readonly workerId: string;
  readonly workerEpoch: number;
  readonly generation: number;
  readonly effectClass: SideEffectClass;
  readonly target: string;
  readonly operation: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly intentCanonical: string;
}

export type SideEffectFenceDecision =
  | { status: "PERMIT"; permit: VerifiedSideEffectPermit }
  | { status: "HOLD"; reason: SideEffectFenceHoldReason };

const issuedPermits = new WeakSet<object>();

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validEffectClass(value: unknown): value is SideEffectClass {
  return value === "EXTERNAL_MUTATION" || value === "EXTERNAL_MESSAGE" || value === "PRODUCTION_WRITE";
}

function canonicalIntent(intent: SideEffectIntent): string {
  return JSON.stringify(intent);
}

function loadFreshCurrent(provider: CurrentStateProvider): CurrentStateSnapshot | null {
  try {
    const snapshot = provider.readCurrentState();
    assertSnapshotInvariant(snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export function issueSideEffectPermit(input: {
  handoffRequest: ExecutionHandoffRequest;
  handoffReceipt: VerifiedExecutionHandoffReceipt;
  currentStateProvider: CurrentStateProvider;
  expectedWorker: WorkerExecutionBinding;
  intent: SideEffectIntent;
  now: string;
}): SideEffectFenceDecision {
  const { handoffRequest, handoffReceipt, expectedWorker, intent } = input;

  if (!isVerifiedExecutionHandoffReceipt(handoffReceipt, handoffRequest)) {
    return { status: "HOLD", reason: "HANDOFF_NOT_VERIFIED" };
  }

  const liveCurrent = loadFreshCurrent(input.currentStateProvider);
  if (liveCurrent === null) {
    return { status: "HOLD", reason: "CURRENT_PROVIDER_FAILURE" };
  }

  if (
    liveCurrent.identity.stateId !== handoffRequest.sourceStateId ||
    liveCurrent.identity.stateRevision !== handoffRequest.sourceStateRevision ||
    intent.sourceStateId !== liveCurrent.identity.stateId ||
    intent.sourceStateRevision !== liveCurrent.identity.stateRevision
  ) {
    return { status: "HOLD", reason: "CURRENT_BINDING_MISMATCH" };
  }

  if (
    intent.handoffId !== handoffRequest.handoffId ||
    intent.actionId !== handoffRequest.actionId ||
    intent.capabilityId !== handoffRequest.capabilityId
  ) {
    return { status: "HOLD", reason: "HANDOFF_BINDING_MISMATCH" };
  }

  if (
    !nonEmpty(expectedWorker.workerId) ||
    !positiveInteger(expectedWorker.workerEpoch) ||
    !positiveInteger(expectedWorker.generation) ||
    !nonEmpty(intent.workerId) ||
    !positiveInteger(intent.workerEpoch) ||
    !positiveInteger(intent.generation)
  ) {
    return { status: "HOLD", reason: "WORKER_BINDING_INVALID" };
  }

  if (intent.workerId !== expectedWorker.workerId || intent.workerEpoch !== expectedWorker.workerEpoch) {
    return { status: "HOLD", reason: "WORKER_EPOCH_MISMATCH" };
  }

  if (intent.generation !== expectedWorker.generation) {
    return { status: "HOLD", reason: "GENERATION_MISMATCH" };
  }

  if (
    !nonEmpty(intent.permitId) ||
    !validEffectClass(intent.effectClass) ||
    !nonEmpty(intent.target) ||
    !nonEmpty(intent.operation)
  ) {
    return { status: "HOLD", reason: "EGRESS_BINDING_INVALID" };
  }

  const issuedAtMs = Date.parse(intent.issuedAt);
  const expiresAtMs = Date.parse(intent.expiresAt);
  const nowMs = Date.parse(input.now);
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    !Number.isFinite(nowMs) ||
    issuedAtMs > nowMs ||
    expiresAtMs <= issuedAtMs ||
    expiresAtMs - issuedAtMs > MAX_EGRESS_PERMIT_TTL_MS
  ) {
    return { status: "HOLD", reason: "INVALID_LIFETIME" };
  }

  if (expiresAtMs <= nowMs) {
    return { status: "HOLD", reason: "EXPIRED" };
  }

  const permit: VerifiedSideEffectPermit = Object.freeze({
    status: "PERMIT",
    runtimeScope: SIDE_EFFECT_PERMIT_RUNTIME_SCOPE,
    permitId: intent.permitId,
    handoffId: intent.handoffId,
    actionId: intent.actionId,
    sourceStateId: intent.sourceStateId,
    sourceStateRevision: intent.sourceStateRevision,
    capabilityId: intent.capabilityId,
    workerId: intent.workerId,
    workerEpoch: intent.workerEpoch,
    generation: intent.generation,
    effectClass: intent.effectClass,
    target: intent.target,
    operation: intent.operation,
    issuedAt: intent.issuedAt,
    expiresAt: intent.expiresAt,
    intentCanonical: canonicalIntent(intent),
  });

  issuedPermits.add(permit);
  return { status: "PERMIT", permit };
}

export function isVerifiedSideEffectPermit(
  permit: VerifiedSideEffectPermit,
  intent: SideEffectIntent,
  now: string,
): boolean {
  const nowMs = Date.parse(now);
  const expiresAtMs = Date.parse(permit.expiresAt);
  return (
    issuedPermits.has(permit) &&
    permit.status === "PERMIT" &&
    permit.runtimeScope === SIDE_EFFECT_PERMIT_RUNTIME_SCOPE &&
    permit.intentCanonical === canonicalIntent(intent) &&
    Number.isFinite(nowMs) &&
    Number.isFinite(expiresAtMs) &&
    nowMs < expiresAtMs
  );
}
