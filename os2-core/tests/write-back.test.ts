// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWriteBack, toWriteBackAtomicCommit } from "../src/write-back.js";

function current(revision = 5) {
  return {
    identity: {
      stateId: "CS-1",
      schemaVersion: "0.1",
      stateRevision: revision,
      effectiveAt: "2026-09-10T18:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-MAIN-001",
    },
    humanDecisionFinal: {
      decisionId: "HD-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "write back test",
    },
    mainLineTask: { taskId: "ML-1", description: "test" },
    nextActionSingle: { actionId: "NA-1", description: "write current" },
    activeRolesAndAuthority: { COMMANDER: "SORA", AUDITOR: "KIRA" },
    activeGuards: [{ guardId: "G-1", rule: "verified only", refConfirmed: "VERIFIED" }],
    confirmedRefIndex: [{ id: "REF-1", status: "VERIFIED", expectedVersion: "v1", path: "evidence/ref-1.json" }],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-10T18:00:00+09:00",
      evidenceSource: "KIRA",
    },
  };
}

function handoff(revision = 5) {
  return {
    handoffId: "HO-1",
    traceId: "TRACE-1",
    actionId: "NA-1",
    sourceStateId: "CS-1",
    sourceStateRevision: revision,
    capabilityId: "CAP-A",
    implementationId: "IMPL-1",
    issuedAt: "2026-09-10T18:00:00+09:00",
    expiresAt: "2026-09-10T19:00:00+09:00",
    evidenceRefIds: ["REF-1"],
  };
}

function result(revision = 5) {
  return {
    resultId: "RESULT-1",
    handoffId: "HO-1",
    traceId: "TRACE-1",
    actionId: "NA-1",
    sourceStateId: "CS-1",
    sourceStateRevision: revision,
    capabilityId: "CAP-A",
    implementationId: "IMPL-1",
    executorId: "EXECUTOR-1",
    verifierId: "KIRA-1",
    outcome: "SUCCEEDED",
    providerExecutionId: "PROVIDER-1",
    observedAt: "2026-09-10T18:30:00+09:00",
    evidenceRefIds: ["REF-1"],
    verification: "VERIFIED",
  };
}

function candidate(parentRevision = 5) {
  return {
    ...current(parentRevision + 1),
    identity: {
      ...current(parentRevision + 1).identity,
      stateId: "CS-1",
      stateRevision: parentRevision + 1,
      lineageId: "LINEAGE-MAIN-001",
      scope: "KIYUSAMA_OS_2",
    },
    writeBack: {
      parent: { parentStateId: "CS-1", parentRevision },
      source: { sourceResultId: "RESULT-1", sourceHandoffId: "HO-1" },
    },
  };
}

function request(parentRevision = 5) {
  return {
    writeBackId: "WB-1",
    parent: { parentStateId: "CS-1", parentRevision },
    source: { sourceResultId: "RESULT-1", sourceHandoffId: "HO-1" },
    consumption: {
      resultConsumptionKey: "RESULT-1",
      handoffConsumptionKey: "HO-1",
    },
    cas: {
      expectedCurrentStateId: "CS-1",
      expectedCurrentRevision: parentRevision,
    },
    candidate: candidate(parentRevision),
  };
}

function input(revision = 5) {
  return {
    current: current(revision),
    handoff: handoff(revision),
    result: result(revision),
    consumedResultIds: new Set(),
    consumedHandoffIds: new Set(),
  };
}

test("0 all write-back conditions satisfied is READY", () => {
  assert.equal(evaluateWriteBack(input(), request()).status, "READY");
});

test("1 consumed result cannot authorize a second write", () => {
  const i = input();
  i.consumedResultIds.add("RESULT-1");
  assert.deepEqual(evaluateWriteBack(i, request()), { status: "HOLD", reason: "RESULT_ALREADY_CONSUMED" });
});

test("2 consumed handoff cannot authorize a second write", () => {
  const i = input();
  i.consumedHandoffIds.add("HO-1");
  assert.deepEqual(evaluateWriteBack(i, request()), { status: "HOLD", reason: "HANDOFF_ALREADY_CONSUMED" });
});

test("3 candidate revision cannot skip parentRevision + 1", () => {
  const r = request();
  r.candidate.identity.stateRevision = 7;
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "REVISION_CONFLICT" });
});

test("4 candidate stateId must remain equal to parentStateId", () => {
  const r = request();
  r.candidate.identity.stateId = "CS-OTHER";
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "REVISION_CONFLICT" });
});

test("5 stale parent/CAS context fails closed", () => {
  const i = input(7);
  const r = request(5);
  assert.deepEqual(evaluateWriteBack(i, r), { status: "HOLD", reason: "PARENT_MISMATCH" });
});

test("6 handoff from another state cannot be reused", () => {
  const i = input();
  i.handoff.sourceStateId = "CS-OTHER";
  assert.deepEqual(evaluateWriteBack(i, request()), { status: "HOLD", reason: "SOURCE_BINDING_MISMATCH" });
});

test("7 resultId comparison is exact and case-sensitive", () => {
  const i = input();
  i.result.resultId = "result-1";
  assert.deepEqual(evaluateWriteBack(i, request()), { status: "HOLD", reason: "SOURCE_BINDING_MISMATCH" });
});

test("8 candidate lineage cannot change during write back", () => {
  const r = request();
  r.candidate.identity.lineageId = "LINEAGE-OTHER";
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "REVISION_CONFLICT" });
});

test("9 atomic commit projection preserves CAS, consumption IDs, and next CURRENT", () => {
  const r = request();
  assert.deepEqual(toWriteBackAtomicCommit(r), {
    expectedCurrent: r.cas,
    consumeResultId: "RESULT-1",
    consumeHandoffId: "HO-1",
    nextCurrent: r.candidate,
  });
});

test("10 E10 activeRolesAndAuthority substitution is HOLD", () => {
  const r = request();
  r.candidate.activeRolesAndAuthority = { ...r.candidate.activeRolesAndAuthority, AUDITOR: "ATTACKER" };
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "IMMUTABLE_STATE_MUTATION" });
});

test("11 E10 nextActionSingle substitution is HOLD", () => {
  const r = request();
  r.candidate.nextActionSingle = { actionId: "ATTACK-ACTION", description: "attacker controlled" };
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "IMMUTABLE_STATE_MUTATION" });
});

test("12 humanDecisionFinal cannot be silently changed", () => {
  const r = request();
  r.candidate.humanDecisionFinal = { ...r.candidate.humanDecisionFinal, shortDirective: "attacker directive" };
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "IMMUTABLE_STATE_MUTATION" });
});

test("13 mainLineTask cannot be silently changed", () => {
  const r = request();
  r.candidate.mainLineTask = { taskId: "ATTACK-TASK", description: "attacker task" };
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "IMMUTABLE_STATE_MUTATION" });
});

test("14 activeGuards cannot be silently changed", () => {
  const r = request();
  r.candidate.activeGuards = [];
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "IMMUTABLE_STATE_MUTATION" });
});

test("15 confirmedRefIndex cannot be silently changed", () => {
  const r = request();
  r.candidate.confirmedRefIndex = [{ id: "ATTACK-REF", status: "VERIFIED", expectedVersion: "v999", path: "attack" }];
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "IMMUTABLE_STATE_MUTATION" });
});

test("16 independentLaneHealth cannot be silently changed", () => {
  const r = request();
  r.candidate.independentLaneHealth = { ...r.candidate.independentLaneHealth, evidenceSource: "ATTACKER" };
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "IMMUTABLE_STATE_MUTATION" });
});

test("17 schemaVersion cannot be silently changed", () => {
  const r = request();
  r.candidate.identity.schemaVersion = "999";
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "IMMUTABLE_STATE_MUTATION" });
});

test("18 candidate must satisfy snapshot invariant", () => {
  const r = request();
  r.candidate.humanDecisionFinal.sourceAuthority = "ATTACKER";
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "INVALID_WRITE_BACK" });
});

test("19 candidate effectiveAt cannot move backwards", () => {
  const r = request();
  r.candidate.identity.effectiveAt = "2026-09-10T17:59:59+09:00";
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "INVALID_WRITE_BACK" });
});

test("20 candidate may advance effectiveAt while preserving parent-owned semantic fields", () => {
  const r = request();
  r.candidate.identity.effectiveAt = "2026-09-10T18:31:00+09:00";
  assert.equal(evaluateWriteBack(input(), r).status, "READY");
});
