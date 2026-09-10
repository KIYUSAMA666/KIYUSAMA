// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateActionEvidenceRequirement } from "../src/action-evidence-requirement.js";

function snapshot() {
  return {
    identity: { stateId: "CS-1", schemaVersion: "0.1", stateRevision: 1, effectiveAt: "2026-09-10T10:00:00+09:00", scope: "KIYUSAMA_OS_2", lineageId: "LINEAGE-MAIN-001" },
    humanDecisionFinal: { decisionId: "HD-1", sourceAuthority: "KIYUSAMA", shortDirective: "test" },
    mainLineTask: { taskId: "ML-1", description: "test" },
    nextActionSingle: { actionId: "NA-1", description: "test" },
    activeRolesAndAuthority: {}, activeGuards: [], confirmedRefIndex: [],
    independentLaneHealth: { status: "UNVERIFIED", evidenceVerdict: "INSUFFICIENT", observedAt: null, evidenceSource: "KIRA" },
  };
}
const ref = (id="REF-1", expectedVersion="1", path="evidence/ref-1") => ({ id, expectedVersion, path });
function baseInput() { return { requirement: { actionId: "NA-1", requiredRefs: [], requireIndependentLane: false }, snapshot: snapshot() }; }

test("1 no refs/no lane is satisfied", () => assert.deepEqual(evaluateActionEvidenceRequirement(baseInput()), {status:"SATISFIED"}));
test("2 missing ref holds", () => { const i=baseInput(); i.requirement.requiredRefs=[ref()]; assert.deepEqual(evaluateActionEvidenceRequirement(i),{status:"HOLD",reason:"REQUIRED_REF_MISSING"}); });
test("3 unverified ref holds", () => { const i=baseInput(); i.requirement.requiredRefs=[ref()]; i.snapshot.confirmedRefIndex=[{...ref(),status:"UNVERIFIED_REF"}]; assert.deepEqual(evaluateActionEvidenceRequirement(i),{status:"HOLD",reason:"REQUIRED_REF_UNVERIFIED"}); });
test("4 exact id/version/path verified passes", () => { const i=baseInput(); i.requirement.requiredRefs=[ref()]; i.snapshot.confirmedRefIndex=[{...ref(),status:"VERIFIED"}]; assert.deepEqual(evaluateActionEvidenceRequirement(i),{status:"SATISFIED"}); });
test("5 wrong expectedVersion holds", () => { const i=baseInput(); i.requirement.requiredRefs=[ref()]; i.snapshot.confirmedRefIndex=[{...ref("REF-1","2"),status:"VERIFIED"}]; assert.deepEqual(evaluateActionEvidenceRequirement(i),{status:"HOLD",reason:"REQUIRED_REF_BINDING_MISMATCH"}); });
test("6 wrong path holds", () => { const i=baseInput(); i.requirement.requiredRefs=[ref()]; i.snapshot.confirmedRefIndex=[{...ref("REF-1","1","other/path"),status:"VERIFIED"}]; assert.deepEqual(evaluateActionEvidenceRequirement(i),{status:"HOLD",reason:"REQUIRED_REF_BINDING_MISMATCH"}); });
test("7 duplicate required id fails closed", () => { const i=baseInput(); i.requirement.requiredRefs=[ref(),ref()]; i.snapshot.confirmedRefIndex=[{...ref(),status:"VERIFIED"}]; assert.deepEqual(evaluateActionEvidenceRequirement(i),{status:"HOLD",reason:"REQUIRED_REF_BINDING_MISMATCH"}); });
test("8 required lane not ready holds", () => { const i=baseInput(); i.requirement.requireIndependentLane=true; assert.deepEqual(evaluateActionEvidenceRequirement(i),{status:"HOLD",reason:"INDEPENDENT_LANE_NOT_READY"}); });
test("9 verified sufficient lane passes", () => { const i=baseInput(); i.requirement.requireIndependentLane=true; i.snapshot.independentLaneHealth={status:"VERIFIED",evidenceVerdict:"SUFFICIENT",observedAt:"2026-09-10T10:00:00+09:00",evidenceSource:"KIRA"}; assert.deepEqual(evaluateActionEvidenceRequirement(i),{status:"SATISFIED"}); });
