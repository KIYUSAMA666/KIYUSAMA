import test from "node:test";
import assert from "node:assert/strict";
import {
  loadDurableActionEvidenceRequirement,
  loadDurableCapabilityBinding,
  type HandoffDurableSourceClientLike,
} from "../src/handoff-durable-sources.js";

function clientFor(dataByRpc: Record<string, unknown>): HandoffDurableSourceClientLike {
  return {
    rpc(functionName) {
      return Promise.resolve({ data: dataByRpc[functionName], error: null });
    },
  };
}

const capabilityId = "11111111-1111-4111-8111-111111111111";

test("1 capability source returns exact verified binding with mandatory revision", async () => {
  const result = await loadDurableCapabilityBinding({
    client: clientFor({
      os2_handoff_read_capability_binding_v01: {
        ok: true,
        capabilityId,
        implementationId: "managed-wake-v1",
        source: "HISTORY",
        version: "1.0.0",
        bindingRevision: 7,
        verified: true,
        verificationRef: "audit://capability/7",
      },
    }),
    capabilityId,
    expectedRevision: 7,
    slotId: "slot-managed-wake",
  });

  assert.equal(result.status, "READY");
  if (result.status === "READY") {
    assert.equal(result.record.bindingRevision, 7);
    assert.equal(result.record.slot.status, "BOUND");
    assert.equal(result.record.slot.binding?.implementationId, "managed-wake-v1");
    assert.equal(result.record.slot.binding?.verified, true);
  }
});

test("2 stale capability revision fails closed", async () => {
  const result = await loadDurableCapabilityBinding({
    client: clientFor({
      os2_handoff_read_capability_binding_v01: {
        ok: true,
        capabilityId,
        implementationId: "managed-wake-v1",
        source: "HISTORY",
        version: "1.0.0",
        bindingRevision: 8,
        verified: true,
        verificationRef: "audit://capability/8",
      },
    }),
    capabilityId,
    expectedRevision: 7,
    slotId: "slot-managed-wake",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "INVALID_RECORD" });
});

test("3 capability source does not accept unverified binding", async () => {
  const result = await loadDurableCapabilityBinding({
    client: clientFor({
      os2_handoff_read_capability_binding_v01: {
        ok: true,
        capabilityId,
        implementationId: "managed-wake-v1",
        source: "HISTORY",
        version: "1.0.0",
        bindingRevision: 7,
        verified: false,
        verificationRef: "audit://capability/7",
      },
    }),
    capabilityId,
    expectedRevision: 7,
    slotId: "slot-managed-wake",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "INVALID_RECORD" });
});

test("4 capability RPC HOLD is not promoted locally", async () => {
  const result = await loadDurableCapabilityBinding({
    client: clientFor({
      os2_handoff_read_capability_binding_v01: { ok: false, reason: "STALE_BINDING" },
    }),
    capabilityId,
    expectedRevision: 7,
    slotId: "slot-managed-wake",
  });
  assert.deepEqual(result, { status: "HOLD", reason: "NOT_READY" });
});

test("5 evidence source returns exact requirement with mandatory revision", async () => {
  const result = await loadDurableActionEvidenceRequirement({
    client: clientFor({
      os2_handoff_read_action_evidence_requirement_v01: {
        ok: true,
        actionId: "BUS_SEND",
        requirementRevision: 4,
        requiredRefs: [
          { id: "ref-a", expectedVersion: "v1", path: "/proof/a" },
          { id: "ref-b", expectedVersion: null, path: null },
        ],
        requireIndependentLane: true,
      },
    }),
    actionId: "BUS_SEND",
    expectedRevision: 4,
  });

  assert.equal(result.status, "READY");
  if (result.status === "READY") {
    assert.equal(result.record.requirementRevision, 4);
    assert.equal(result.record.requirement.actionId, "BUS_SEND");
    assert.equal(result.record.requirement.requiredRefs.length, 2);
    assert.equal(result.record.requirement.requireIndependentLane, true);
  }
});

test("6 stale evidence requirement revision fails closed", async () => {
  const result = await loadDurableActionEvidenceRequirement({
    client: clientFor({
      os2_handoff_read_action_evidence_requirement_v01: {
        ok: true,
        actionId: "BUS_SEND",
        requirementRevision: 5,
        requiredRefs: [],
        requireIndependentLane: true,
      },
    }),
    actionId: "BUS_SEND",
    expectedRevision: 4,
  });
  assert.deepEqual(result, { status: "HOLD", reason: "INVALID_RECORD" });
});

test("7 malformed or duplicate required refs fail closed", async () => {
  const result = await loadDurableActionEvidenceRequirement({
    client: clientFor({
      os2_handoff_read_action_evidence_requirement_v01: {
        ok: true,
        actionId: "BUS_SEND",
        requirementRevision: 4,
        requiredRefs: [
          { id: "same", expectedVersion: null, path: null },
          { id: "same", expectedVersion: null, path: null },
        ],
        requireIndependentLane: false,
      },
    }),
    actionId: "BUS_SEND",
    expectedRevision: 4,
  });
  assert.deepEqual(result, { status: "HOLD", reason: "INVALID_RECORD" });
});

test("8 RPC errors fail closed", async () => {
  const client: HandoffDurableSourceClientLike = {
    rpc() {
      return Promise.resolve({ data: null, error: new Error("db unavailable") });
    },
  };
  assert.deepEqual(
    await loadDurableActionEvidenceRequirement({ client, actionId: "BUS_SEND", expectedRevision: 1 }),
    { status: "HOLD", reason: "SOURCE_ERROR" },
  );
});
