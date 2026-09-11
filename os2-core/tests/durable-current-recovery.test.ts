// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { recoverDurableCurrent } from "../src/durable-current-recovery.js";

function current(revision = 2) {
  return {
    identity: {
      stateId: "OS2-RECOVERY-V01-STATE",
      schemaVersion: "0.1",
      stateRevision: revision,
      effectiveAt: "2026-09-11T20:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "OS2-RECOVERY-V01-LINEAGE",
    },
    humanDecisionFinal: {
      decisionId: "DECISION-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "recover durable current",
    },
    mainLineTask: { taskId: "TASK-1", description: "test recovery" },
    nextActionSingle: { actionId: "ACTION-1", description: "resume safely" },
    activeRolesAndAuthority: { SORA: "AGGREGATOR", KIRA: "INDEPENDENT_AUDIT" },
    activeGuards: [],
    confirmedRefIndex: [],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-11T19:59:00+09:00",
      evidenceSource: "KIRA-INDEPENDENT",
    },
  };
}

const expected = {
  stateId: "OS2-RECOVERY-V01-STATE",
  lineageId: "OS2-RECOVERY-V01-LINEAGE",
  minCommitSequence: 1,
};

function record() {
  return {
    stateId: "OS2-RECOVERY-V01-STATE",
    revision: 2,
    current: current(2),
    commitSequence: 7,
  };
}

test("1 exact durable CURRENT recovers", () => {
  const result = recoverDurableCurrent(record(), expected);
  assert.equal(result.status, "RECOVERED");
  assert.equal(result.commitSequence, 7);
  assert.equal(result.current.identity.stateRevision, 2);
});

test("2 missing CURRENT holds", () => {
  assert.deepEqual(recoverDurableCurrent(null, expected), { status: "HOLD", reason: "MISSING_CURRENT" });
});

test("3 malformed CURRENT holds", () => {
  assert.deepEqual(recoverDurableCurrent({ nope: true }, expected), { status: "HOLD", reason: "MALFORMED_CURRENT" });
});

test("4 wrong durable state id holds", () => {
  const r = record();
  r.stateId = "FOREIGN";
  assert.equal(recoverDurableCurrent(r, expected).reason, "STATE_ID_MISMATCH");
});

test("5 payload state id substitution holds", () => {
  const r = record();
  r.current.identity.stateId = "FOREIGN";
  assert.equal(recoverDurableCurrent(r, expected).reason, "STATE_ID_MISMATCH");
});

test("6 row revision and payload revision must match", () => {
  const r = record();
  r.revision = 3;
  assert.equal(recoverDurableCurrent(r, expected).reason, "REVISION_MISMATCH");
});

test("7 lineage substitution holds", () => {
  const r = record();
  r.current.identity.lineageId = "FOREIGN-LINEAGE";
  assert.equal(recoverDurableCurrent(r, expected).reason, "LINEAGE_MISMATCH");
});

test("8 stale commit sequence holds", () => {
  const r = record();
  r.commitSequence = 0;
  assert.equal(recoverDurableCurrent(r, expected).reason, "COMMIT_SEQUENCE_TOO_OLD");
});

test("9 non-KIYUSAMA authority is malformed durable current", () => {
  const r = record();
  r.current.humanDecisionFinal.sourceAuthority = "SORA";
  assert.equal(recoverDurableCurrent(r, expected).reason, "MALFORMED_CURRENT");
});

test("10 recovery returns a clone, not provider-owned object", () => {
  const r = record();
  const result = recoverDurableCurrent(r, expected);
  assert.equal(result.status, "RECOVERED");
  result.current.mainLineTask.description = "mutated locally";
  assert.equal(r.current.mainLineTask.description, "test recovery");
});
