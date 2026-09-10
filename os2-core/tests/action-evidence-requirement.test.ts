// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateActionEvidenceRequirement } from "../src/action-evidence-requirement.js";

function snapshot() {
  return {
    identity: {
      stateId: "CS-1",
      schemaVersion: "0.1",
      stateRevision: 1,
      effectiveAt: "2026-09-10T10:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-MAIN-001",
    },
    humanDecisionFinal: {
      decisionId: "HD-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "test",
    },
    mainLineTask: { taskId: "ML-1", description: "test" },
    nextActionSingle: { actionId: "NA-1", description: "test" },
    activeRolesAndAuthority: {},
    activeGuards: [],
    confirmedRefIndex: [],
    independentLaneHealth: {
      status: "UNVERIFIED",
      evidenceVerdict: "INSUFFICIENT",
      observedAt: null,
      evidenceSource: "KIRA",
    },
  };
}

function baseInput() {
  return {
    requirement: {
      actionId: "NA-1",
      requiredRefIds: [],
      requireIndependentLane: false,
    },
    snapshot: snapshot(),
  };
}

test("1 no required refs and no independent lane requirement is satisfied", () => {
  assert.deepEqual(evaluateActionEvidenceRequirement(baseInput()), { status: "SATISFIED" });
});

test("2 missing required ref holds", () => {
  const input = baseInput();
  input.requirement.requiredRefIds = ["REF-1"];
  assert.deepEqual(evaluateActionEvidenceRequirement(input), {
    status: "HOLD",
    reason: "REQUIRED_REF_MISSING",
  });
});

test("3 unverified required ref holds", () => {
  const input = baseInput();
  input.requirement.requiredRefIds = ["REF-1"];
  input.snapshot.confirmedRefIndex = [
    { id: "REF-1", status: "UNVERIFIED_REF", expectedVersion: "1", path: "evidence/ref-1" },
  ];
  assert.deepEqual(evaluateActionEvidenceRequirement(input), {
    status: "HOLD",
    reason: "REQUIRED_REF_UNVERIFIED",
  });
});

test("4 all required refs verified is satisfied when independent lane is not required", () => {
  const input = baseInput();
  input.requirement.requiredRefIds = ["REF-1", "REF-2"];
  input.snapshot.confirmedRefIndex = [
    { id: "REF-1", status: "VERIFIED", expectedVersion: "1", path: "evidence/ref-1" },
    { id: "REF-2", status: "VERIFIED", expectedVersion: "2", path: "evidence/ref-2" },
  ];
  assert.deepEqual(evaluateActionEvidenceRequirement(input), { status: "SATISFIED" });
});

test("5 independent lane with non-verified status holds when required", () => {
  const input = baseInput();
  input.requirement.requireIndependentLane = true;
  input.snapshot.independentLaneHealth = {
    status: "HOLD",
    evidenceVerdict: "SUFFICIENT",
    observedAt: "2026-09-10T10:00:00+09:00",
    evidenceSource: "KIRA",
  };
  assert.deepEqual(evaluateActionEvidenceRequirement(input), {
    status: "HOLD",
    reason: "INDEPENDENT_LANE_NOT_READY",
  });
});

test("6 independent lane with insufficient evidence holds when required", () => {
  const input = baseInput();
  input.requirement.requireIndependentLane = true;
  input.snapshot.independentLaneHealth = {
    status: "VERIFIED",
    evidenceVerdict: "INSUFFICIENT",
    observedAt: "2026-09-10T10:00:00+09:00",
    evidenceSource: "KIRA",
  };
  assert.deepEqual(evaluateActionEvidenceRequirement(input), {
    status: "HOLD",
    reason: "INDEPENDENT_LANE_NOT_READY",
  });
});

test("7 verified sufficient independent lane is satisfied when required", () => {
  const input = baseInput();
  input.requirement.requiredRefIds = ["REF-1"];
  input.requirement.requireIndependentLane = true;
  input.snapshot.confirmedRefIndex = [
    { id: "REF-1", status: "VERIFIED", expectedVersion: "1", path: "evidence/ref-1" },
  ];
  input.snapshot.independentLaneHealth = {
    status: "VERIFIED",
    evidenceVerdict: "SUFFICIENT",
    observedAt: "2026-09-10T10:00:00+09:00",
    evidenceSource: "KIRA",
  };
  assert.deepEqual(evaluateActionEvidenceRequirement(input), { status: "SATISFIED" });
});
