import type { ActionEvidenceRequirement, RequiredEvidenceRefBinding } from "./action-evidence-requirement.js";
import type { CapabilityCandidateSource, CapabilitySlot } from "./capability-slot.js";

export interface HandoffDurableSourceClientLike {
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export interface DurableCapabilityBindingRecord {
  slot: CapabilitySlot;
  bindingRevision: number;
  verificationRef: string;
}

export interface DurableActionEvidenceRequirementRecord {
  requirement: ActionEvidenceRequirement;
  requirementRevision: number;
}

export type DurableSourceHoldReason =
  | "SOURCE_ERROR"
  | "INVALID_RECORD"
  | "NOT_READY";

export type DurableSourceDecision<T> =
  | { status: "READY"; record: T }
  | { status: "HOLD"; reason: DurableSourceHoldReason };

const CAPABILITY_RPC = "os2_handoff_read_capability_binding_v01";
const EVIDENCE_RPC = "os2_handoff_read_action_evidence_requirement_v01";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isCapabilitySource(value: unknown): value is CapabilityCandidateSource {
  return value === "NATIVE" || value === "HISTORY" || value === "EXTERNAL";
}

function parseRequiredRefs(value: unknown): ReadonlyArray<RequiredEvidenceRefBinding> | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  const parsed: RequiredEvidenceRefBinding[] = [];

  for (const item of value) {
    if (!isRecord(item)) return null;
    const keys = Object.keys(item).sort();
    const expectedKeys = ["expectedVersion", "id", "path"];
    if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
      return null;
    }
    if (!nonEmpty(item.id) || ids.has(item.id)) return null;
    if (!(item.expectedVersion === null || typeof item.expectedVersion === "string")) return null;
    if (!(item.path === null || typeof item.path === "string")) return null;
    ids.add(item.id);
    parsed.push({
      id: item.id,
      expectedVersion: item.expectedVersion as string | null,
      path: item.path as string | null,
    });
  }

  return Object.freeze(parsed);
}

export async function loadDurableCapabilityBinding(input: {
  client: HandoffDurableSourceClientLike;
  capabilityId: string;
  expectedRevision: number;
  slotId: string;
}): Promise<DurableSourceDecision<DurableCapabilityBindingRecord>> {
  if (!nonEmpty(input.capabilityId) || !nonEmpty(input.slotId) || !positiveInteger(input.expectedRevision)) {
    return { status: "HOLD", reason: "INVALID_RECORD" };
  }

  try {
    const { data, error } = await input.client.rpc(CAPABILITY_RPC, {
      p_capability_id: input.capabilityId,
      p_expected_revision: input.expectedRevision,
    });
    if (error !== null) return { status: "HOLD", reason: "SOURCE_ERROR" };
    if (!isRecord(data) || data.ok !== true) return { status: "HOLD", reason: "NOT_READY" };

    if (
      data.capabilityId !== input.capabilityId ||
      !nonEmpty(data.implementationId) ||
      !isCapabilitySource(data.source) ||
      !nonEmpty(data.version) ||
      data.verified !== true ||
      !positiveInteger(data.bindingRevision) ||
      data.bindingRevision !== input.expectedRevision ||
      !nonEmpty(data.verificationRef)
    ) {
      return { status: "HOLD", reason: "INVALID_RECORD" };
    }

    return {
      status: "READY",
      record: {
        bindingRevision: data.bindingRevision,
        verificationRef: data.verificationRef,
        slot: {
          slotId: input.slotId,
          capabilityId: input.capabilityId,
          status: "BOUND",
          binding: {
            capabilityId: input.capabilityId,
            implementationId: data.implementationId,
            source: data.source,
            version: data.version,
            verified: true,
          },
        },
      },
    };
  } catch {
    return { status: "HOLD", reason: "SOURCE_ERROR" };
  }
}

export async function loadDurableActionEvidenceRequirement(input: {
  client: HandoffDurableSourceClientLike;
  actionId: string;
  expectedRevision: number;
}): Promise<DurableSourceDecision<DurableActionEvidenceRequirementRecord>> {
  if (!nonEmpty(input.actionId) || !positiveInteger(input.expectedRevision)) {
    return { status: "HOLD", reason: "INVALID_RECORD" };
  }

  try {
    const { data, error } = await input.client.rpc(EVIDENCE_RPC, {
      p_action_id: input.actionId,
      p_expected_revision: input.expectedRevision,
    });
    if (error !== null) return { status: "HOLD", reason: "SOURCE_ERROR" };
    if (!isRecord(data) || data.ok !== true) return { status: "HOLD", reason: "NOT_READY" };

    const requiredRefs = parseRequiredRefs(data.requiredRefs);
    if (
      data.actionId !== input.actionId ||
      !positiveInteger(data.requirementRevision) ||
      data.requirementRevision !== input.expectedRevision ||
      requiredRefs === null ||
      typeof data.requireIndependentLane !== "boolean"
    ) {
      return { status: "HOLD", reason: "INVALID_RECORD" };
    }

    return {
      status: "READY",
      record: {
        requirementRevision: data.requirementRevision,
        requirement: {
          actionId: input.actionId,
          requiredRefs,
          requireIndependentLane: data.requireIndependentLane,
        },
      },
    };
  } catch {
    return { status: "HOLD", reason: "SOURCE_ERROR" };
  }
}
