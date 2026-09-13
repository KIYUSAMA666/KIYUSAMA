import {
  isVerifiedExecutionHandoffReceipt,
  type ExecutionHandoffRequest,
  type VerifiedExecutionHandoffReceipt,
} from "./execution-handoff.js";

/**
 * SIDE-EFFECT FENCE / EXECUTION CONTROL v0.1
 *
 * Converts an already-verified execution handoff into a narrowly-bound egress
 * permit. The permit is bound to CURRENT, worker identity, worker epoch,
 * generation, capability, target and operation. A caller cannot manufacture a
 * valid permit by shape alone; issuance is tracked in-process and can be
 * checked immediately before gateway dispatch.
 */

export const MAX_EGRESS_PERMIT_TTL_MS = 5 * 60 * 1000;

export type SideEffectClass =
  | "EXTERNAL_MUTATION"
  | "EXTERNAL_MESSAGE"
  | "PRODUCTION_WRITE";

export interface WorkerExecutionBinding {
  workerId: string;
  workerEpoch: number;
  generation: number;
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

export function issueSideEffectPermit(input: {
  handoffRequest: ExecutionHandoffRequest;
  handoffReceipt: VerifiedExecutionHandoffReceipt;
  currentStateId: string;
  currentStateRevision: number;
  expectedWorker: WorkerExecutionBinding;
  intent: SideEffectIntent;
  now: string;
}): SideEffectFenceDecision {
  const { handoffRequest, handoffReceipt, expectedWorker, intent } = input;

  if (!isVerifiedExecutionHandoffReceipt(handoffReceipt, handoffRequest)) {
    return { status: "HOLD", reason: "HANDOFF_NOT_VERIFIED" };
  }

  if (
    input.currentStateId !== handoffRequest.sourceStateId ||
    input.currentStateRevision !== handoffRequest.sourceStateRevision ||
    intent.sourceStateId !== input.currentStateId ||
    intent.sourceStateRevision !== input.currentStateRevision
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
    permit.intentCanonical === canonicalIntent(intent) &&
    Number.isFinite(nowMs) &&
    Number.isFinite(expiresAtMs) &&
    nowMs < expiresAtMs
  );
}
