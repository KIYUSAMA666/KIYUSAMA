import test from "node:test";
import assert from "node:assert/strict";
import { assertSnapshotInvariant, selectCurrentSnapshot, type CurrentStateSnapshot } from "../src/current-state.js";

function snapshot(revision = 1): CurrentStateSnapshot {
  return {
    identity: { stateId: `CS-${revision}`, schemaVersion: "0.1", stateRevision: revision, effectiveAt: "2026-09-09T08:00:00+09:00", scope: "KIYUSAMA_OS_2", lineageId: "LINEAGE-MAIN-001" },
    humanDecisionFinal: { decisionId: "HD-1", sourceAuthority: "KIYUSAMA", shortDirective: "test" },
    mainLineTask: { taskId: "ML-1", description: "test" },
    nextActionSingle: { actionId: "NA-1", description: "test" },
    activeRolesAndAuthority: {}, activeGuards: [], confirmedRefIndex: [],
    independentLaneHealth: { status: "UNVERIFIED", evidenceVerdict: "INSUFFICIENT", observedAt: null, evidenceSource: "KIRA" },
  };
}

test("1 higher revision wins", () => assert.equal(selectCurrentSnapshot(snapshot(1), snapshot(2)).status, "SELECTED"));
test("2 same revision same payload selects", () => assert.equal(selectCurrentSnapshot(snapshot(1), snapshot(1)).status, "SELECTED"));
test("3 same revision different payload conflicts", () => { const b=snapshot(1); b.mainLineTask.description="different"; assert.equal(selectCurrentSnapshot(snapshot(1),b).status,"STATE_CONFLICT"); });
test("4 different lineage conflicts", () => { const b=snapshot(2); b.identity.lineageId="OTHER"; assert.equal(selectCurrentSnapshot(snapshot(1),b).status,"LINEAGE_CONFLICT"); });
test("5 different scope conflicts", () => { const b=snapshot(2) as CurrentStateSnapshot & {identity:{scope:string}}; b.identity.scope="OTHER"; assert.equal(selectCurrentSnapshot(snapshot(1),b as CurrentStateSnapshot).status,"STATE_CONFLICT"); });
test("6 invalid revision rejected", () => { for (const r of [0,-1,1.5]) { const s=snapshot(1); s.identity.stateRevision=r; assert.throws(()=>assertSnapshotInvariant(s)); } });
test("7 non-KIYUSAMA final authority rejected", () => { const s=snapshot(1); (s.humanDecisionFinal as {sourceAuthority:string}).sourceAuthority="SORA"; assert.throws(()=>assertSnapshotInvariant(s)); });
test("8 empty next action rejected", () => { const s=snapshot(1); s.nextActionSingle.actionId="   "; assert.throws(()=>assertSnapshotInvariant(s)); });
