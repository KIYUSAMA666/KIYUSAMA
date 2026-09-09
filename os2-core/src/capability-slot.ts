export type CapabilitySlotStatus = "EMPTY" | "BOUND" | "HOLD";
export type CapabilityCandidateSource = "NATIVE" | "HISTORY" | "EXTERNAL";

export interface CapabilityBinding {
  capabilityId: string;
  implementationId: string;
  source: CapabilityCandidateSource;
  version: string;
  verified: boolean;
}

export interface CapabilitySlot {
  slotId: string;
  capabilityId: string;
  status: CapabilitySlotStatus;
  binding: CapabilityBinding | null;
}

export type BindDecision =
  | { status: "BOUND"; slot: CapabilitySlot }
  | {
      status: "REJECTED";
      reason: "CAPABILITY_MISMATCH" | "UNVERIFIED_IMPLEMENTATION" | "SLOT_NOT_EMPTY";
    };

export function createEmptyCapabilitySlot(slotId: string, capabilityId: string): CapabilitySlot {
  if (!slotId.trim()) throw new Error("slotId is required");
  if (!capabilityId.trim()) throw new Error("capabilityId is required");

  return {
    slotId,
    capabilityId,
    status: "EMPTY",
    binding: null,
  };
}

/**
 * Capability slots are intentionally implementation-agnostic.
 * Historical or external candidates may be evaluated later, but nothing is
 * auto-promoted into the OS core. Binding is fail-closed and requires an
 * explicit verified candidate that matches the slot capability.
 */
export function bindCapability(slot: CapabilitySlot, candidate: CapabilityBinding): BindDecision {
  if (slot.status !== "EMPTY" || slot.binding !== null) {
    return { status: "REJECTED", reason: "SLOT_NOT_EMPTY" };
  }
  if (candidate.capabilityId !== slot.capabilityId) {
    return { status: "REJECTED", reason: "CAPABILITY_MISMATCH" };
  }
  if (!candidate.verified) {
    return { status: "REJECTED", reason: "UNVERIFIED_IMPLEMENTATION" };
  }

  return {
    status: "BOUND",
    slot: {
      ...slot,
      status: "BOUND",
      binding: candidate,
    },
  };
}

export function holdCapabilitySlot(slot: CapabilitySlot): CapabilitySlot {
  return {
    ...slot,
    status: "HOLD",
  };
}
