import type { ActionEvidenceRequirement, RequiredEvidenceRefBinding } from "./action-evidence-requirement.js";
import type { CapabilitySlot } from "./capability-slot.js";
import type { CurrentStateSnapshot } from "./current-state.js";
import type { PreExecutionGateDecision } from "./pre-execution-gate.js";

export const MAX_EXECUTION_HANDOFF_TTL_MS = 60 * 60 * 1000;

export interface ExecutionHandoffInput {
  snapshot: CurrentStateSnapshot;
  actionEvidenceRequirement: ActionEvidenceRequirement;
  capabilitySlot: CapabilitySlot;
  gateDecision: PreExecutionGateDecision;
}

export interface ResultEvidencePolicy {
  requiredRefs: ReadonlyArray<RequiredEvidenceRefBinding>;
  verifierId: string;
  evidenceSource: string;
}

export interface ExecutionHandoffRequest {
  handoffId: string;
  traceId: string;
  actionId: string;
  sourceStateId: string;
  sourceStateRevision: number;
  capabilityId: string;
  implementationId: string;
  issuedAt: string;
  expiresAt: string;
  evidenceRefs: ReadonlyArray<RequiredEvidenceRefBinding>;
  resultEvidencePolicy: ResultEvidencePolicy;
}

export type ExecutionHandoffHoldReason =
  | "GATE_NOT_ALLOWED"
  | "GATE_DECISION_MISMATCH"
  | "CAPABILITY_NOT_READY"
  | "HANDOFF_MISMATCH"
  | "STATE_CHANGED"
  | "EVIDENCE_NOT_VERIFIED"
  | "EVIDENCE_BINDING_MISMATCH"
  | "RESULT_EVIDENCE_POLICY_INVALID"
  | "INDEPENDENT_LANE_NOT_READY"
  | "INVALID_LIFETIME"
  | "EXPIRED";

export type ExecutionHandoffDecision =
  | { status: "READY" }
  | { status: "HOLD"; reason: ExecutionHandoffHoldReason };

export interface VerifiedExecutionHandoffReceipt {
  readonly status: "READY";
  readonly handoffId: string;
  readonly sourceStateId: string;
  readonly sourceStateRevision: number;
  readonly requestCanonical: string;
}

export type VerifiedExecutionHandoffReceiptDecision =
  | { status: "READY"; receipt: VerifiedExecutionHandoffReceipt }
  | { status: "HOLD"; reason: ExecutionHandoffHoldReason };

const verifiedExecutionHandoffReceipts = new WeakSet<object>();

function sameRefBinding(a: RequiredEvidenceRefBinding, b: RequiredEvidenceRefBinding): boolean {
  return a.id === b.id && a.expectedVersion === b.expectedVersion && a.path === b.path;
}

function hasExactRefSet(
  actual: ReadonlyArray<RequiredEvidenceRefBinding>,
  required: ReadonlyArray<RequiredEvidenceRefBinding>,
): boolean {
  if (actual.length !== required.length) return false;
  const ids = new Set(actual.map((ref) => ref.id));
  if (ids.size !== actual.length) return false;
  return required.every((requiredRef) => actual.some((actualRef) => sameRefBinding(actualRef, requiredRef)));
}

function canonicalHandoffRequest(request: ExecutionHandoffRequest): string {
  return JSON.stringify(request);
}

export function evaluateExecutionHandoff(
  input: ExecutionHandoffInput,
  request: ExecutionHandoffRequest,
  now: string,
): ExecutionHandoffDecision {
  if (input.gateDecision.status !== "ALLOW") {
    return { status: "HOLD", reason: "GATE_NOT_ALLOWED" };
  }

  if (
    input.gateDecision.actionId !== request.actionId ||
    input.gateDecision.stateId !== request.sourceStateId ||
    input.gateDecision.stateRevision !== request.sourceStateRevision ||
    input.gateDecision.actionId !== input.snapshot.nextActionSingle.actionId ||
    input.gateDecision.stateId !== input.snapshot.identity.stateId ||
    input.gateDecision.stateRevision !== input.snapshot.identity.stateRevision
  ) {
    return { status: "HOLD", reason: "GATE_DECISION_MISMATCH" };
  }

  const binding = input.capabilitySlot.binding;
  if (input.capabilitySlot.status !== "BOUND" || binding === null || !binding.verified) {
    return { status: "HOLD", reason: "CAPABILITY_NOT_READY" };
  }

  if (
    request.actionId !== input.snapshot.nextActionSingle.actionId ||
    input.actionEvidenceRequirement.actionId !== request.actionId ||
    request.capabilityId !== input.capabilitySlot.capabilityId ||
    request.capabilityId !== binding.capabilityId ||
    request.implementationId !== binding.implementationId
  ) {
    return { status: "HOLD", reason: "HANDOFF_MISMATCH" };
  }

  if (
    request.sourceStateId !== input.snapshot.identity.stateId ||
    request.sourceStateRevision !== input.snapshot.identity.stateRevision
  ) {
    return { status: "HOLD", reason: "STATE_CHANGED" };
  }

  if (
    input.actionEvidenceRequirement.requireIndependentLane &&
    (input.snapshot.independentLaneHealth.status !== "VERIFIED" ||
      input.snapshot.independentLaneHealth.evidenceVerdict !== "SUFFICIENT")
  ) {
    return { status: "HOLD", reason: "INDEPENDENT_LANE_NOT_READY" };
  }

  const requiredRefs = input.actionEvidenceRequirement.requiredRefs;
  if (!hasExactRefSet(request.evidenceRefs, requiredRefs)) {
    return { status: "HOLD", reason: "EVIDENCE_BINDING_MISMATCH" };
  }

  for (const requiredRef of requiredRefs) {
    const matchedRef = input.snapshot.confirmedRefIndex.find((ref) => ref.id === requiredRef.id);
    if (matchedRef === undefined || matchedRef.status !== "VERIFIED") {
      return { status: "HOLD", reason: "EVIDENCE_NOT_VERIFIED" };
    }
    if (
      matchedRef.expectedVersion !== requiredRef.expectedVersion ||
      matchedRef.path !== requiredRef.path
    ) {
      return { status: "HOLD", reason: "EVIDENCE_BINDING_MISMATCH" };
    }
  }

  const resultPolicy = request.resultEvidencePolicy;
  const resultIds = new Set(resultPolicy.requiredRefs.map((ref) => ref.id));
  if (
    !resultPolicy.verifierId.trim() ||
    !resultPolicy.evidenceSource.trim() ||
    resultPolicy.requiredRefs.length === 0 ||
    resultIds.size !== resultPolicy.requiredRefs.length ||
    resultPolicy.requiredRefs.some((ref) => !ref.id.trim())
  ) {
    return { status: "HOLD", reason: "RESULT_EVIDENCE_POLICY_INVALID" };
  }

  const issuedAtMs = Date.parse(request.issuedAt);
  const expiresAtMs = Date.parse(request.expiresAt);
  const nowMs = Date.parse(now);
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    !Number.isFinite(nowMs) ||
    issuedAtMs > nowMs ||
    expiresAtMs <= issuedAtMs ||
    expiresAtMs - issuedAtMs > MAX_EXECUTION_HANDOFF_TTL_MS
  ) {
    return { status: "HOLD", reason: "INVALID_LIFETIME" };
  }

  if (expiresAtMs <= nowMs) {
    return { status: "HOLD", reason: "EXPIRED" };
  }

  return { status: "READY" };
}

export function issueVerifiedExecutionHandoffReceipt(
  input: ExecutionHandoffInput,
  request: ExecutionHandoffRequest,
  now: string,
): VerifiedExecutionHandoffReceiptDecision {
  const decision = evaluateExecutionHandoff(input, request, now);
  if (decision.status !== "READY") return decision;

  const receipt: VerifiedExecutionHandoffReceipt = Object.freeze({
    status: "READY",
    handoffId: request.handoffId,
    sourceStateId: request.sourceStateId,
    sourceStateRevision: request.sourceStateRevision,
    requestCanonical: canonicalHandoffRequest(request),
  });
  verifiedExecutionHandoffReceipts.add(receipt);
  return { status: "READY", receipt };
}

export function isVerifiedExecutionHandoffReceipt(
  receipt: VerifiedExecutionHandoffReceipt,
  request: ExecutionHandoffRequest,
): boolean {
  return (
    verifiedExecutionHandoffReceipts.has(receipt) &&
    receipt.status === "READY" &&
    receipt.handoffId === request.handoffId &&
    receipt.sourceStateId === request.sourceStateId &&
    receipt.sourceStateRevision === request.sourceStateRevision &&
    receipt.requestCanonical === canonicalHandoffRequest(request)
  );
}
