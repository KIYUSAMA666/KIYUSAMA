import test from "node:test";
import assert from "node:assert/strict";
import {
  bindCapability,
  createEmptyCapabilitySlot,
  holdCapabilitySlot,
  type CapabilityBinding,
} from "../src/capability-slot.js";

const verifiedCandidate: CapabilityBinding = {
  capabilityId: "wake-engine",
  implementationId: "candidate-v1",
  source: "HISTORY",
  version: "1.0.0",
  verified: true,
};

test("creates an empty implementation-agnostic slot", () => {
  assert.deepEqual(createEmptyCapabilitySlot("slot-wake", "wake-engine"), {
    slotId: "slot-wake",
    capabilityId: "wake-engine",
    status: "EMPTY",
    binding: null,
  });
});

test("verified matching implementation may bind", () => {
  const slot = createEmptyCapabilitySlot("slot-wake", "wake-engine");
  const result = bindCapability(slot, verifiedCandidate);
  assert.equal(result.status, "BOUND");
  if (result.status === "BOUND") {
    assert.equal(result.slot.binding?.implementationId, "candidate-v1");
    assert.equal(result.slot.binding?.source, "HISTORY");
  }
});

test("unverified implementation is fail-closed", () => {
  const slot = createEmptyCapabilitySlot("slot-wake", "wake-engine");
  assert.deepEqual(bindCapability(slot, { ...verifiedCandidate, verified: false }), {
    status: "REJECTED",
    reason: "UNVERIFIED_IMPLEMENTATION",
  });
});

test("capability mismatch is rejected", () => {
  const slot = createEmptyCapabilitySlot("slot-memory", "memory-engine");
  assert.deepEqual(bindCapability(slot, verifiedCandidate), {
    status: "REJECTED",
    reason: "CAPABILITY_MISMATCH",
  });
});

test("non-empty slot cannot be overwritten", () => {
  const slot = createEmptyCapabilitySlot("slot-wake", "wake-engine");
  const first = bindCapability(slot, verifiedCandidate);
  assert.equal(first.status, "BOUND");
  if (first.status !== "BOUND") return;

  assert.deepEqual(
    bindCapability(first.slot, { ...verifiedCandidate, implementationId: "candidate-v2" }),
    { status: "REJECTED", reason: "SLOT_NOT_EMPTY" },
  );
});

test("slot can be explicitly held without selecting an implementation", () => {
  const slot = holdCapabilitySlot(createEmptyCapabilitySlot("slot-wake", "wake-engine"));
  assert.equal(slot.status, "HOLD");
  assert.equal(slot.binding, null);
});
