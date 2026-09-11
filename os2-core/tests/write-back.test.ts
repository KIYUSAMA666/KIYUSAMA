// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { issueVerifiedExecutionHandoffReceipt } from "../src/execution-handoff.js";
import { issueAcceptedExecutionResultReceipt } from "../src/execution-result-evidence.js";
import { evaluateWriteBack, toWriteBackAtomicCommit } from "../src/write-back.js";

const prereqRef = { id: "REF-PRE-1", expectedVersion: "1", path: "evidence/REF-PRE-1" };
const resultRef = { id: "REF-RESULT-1", expectedVersion: "1", path: "evidence/REF-RESULT-1" };
const NOW = "2026-09-10T18:30:00+09:00";

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
    activeRolesAndAuthority: { verifier: "KIRA-1" },
    activeGuards: [{ guardId: "G-1", rule: "fail closed", refConfirmed: "VERIFIED" }],
    confirmedRefIndex: [
      { ...prereqRef, status: "VERIFIED" },
      { ...resultRef, status: "VERIFIED" },
    ],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-10T18:00:00+09:00",
      evidenceSource: "KIRA-1",
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
    evidenceRefs: [prereqRef],
    resultEvidencePolicy: {
      requiredRefs: [resultRef],
      verifierId: "KIRA-1",
      evidenceSource: "KIRA-1",
    },
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
    observedAt: NOW,
    evidenceRefIds: ["REF-RESULT-1"],
    verification: "VERIFIED",
  };
}

function handoffInput(snapshot = current()) {
  return {
    snapshot,
    actionEvidenceRequirement: {
      actionId: "NA-1",
      requiredRefs: [prereqRef],
      requireIndependentLane: true,
    },
    capabilitySlot: {
      slotId: "S-1",
      capabilityId: "CAP-A",
      status: "BOUND",
      binding: {
        capabilityId: "CAP-A",
        implementationId: "IMPL-1",
        source: "NATIVE",
        version: "1",
        verified: true,
      },
    },
    gateDecision: { status: "ALLOW", actionId: "NA-1", stateId: "CS-1", stateRevision: snapshot.identity.stateRevision },
  };
}

function candidate(parentRevision = 5) {
  const base = current(parentRevision);
  return {
    ...base,
    identity: {
      ...base.identity,
      stateRevision: parentRevision + 1,
      effectiveAt: "2026-09-10T18:31:00+09:00",
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
  const snapshot = current(revision);
  const h = handoff(revision);
  const r = result(revision);

  const handoffDecision = issueVerifiedExecutionHandoffReceipt(handoffInput(snapshot), h, NOW);
  assert.equal(handoffDecision.status, "READY");

  const resultDecision = issueAcceptedExecutionResultReceipt({ snapshot, handoff: h, evidence: r });
  assert.equal(resultDecision.status, "ACCEPTED");

  return {
    current: snapshot,
    handoff: h,
    handoffReceipt: handoffDecision.receipt,
    result: r,
    resultReceipt: resultDecision.receipt,
    consumedResultIds: new Set(),
    consumedHandoffIds: new Set(),
  };
}

test("0 all write-back conditions satisfied is READY", () => {
  assert.equal(evaluateWriteBack(input(), request()).status, "READY");
});

test("1 fabricated handoff READY cannot authorize write-back", () => {
  const i = input();
  i.handoffReceipt = { status: "READY", handoffId: "HO-1", sourceStateId: "CS-1", sourceStateRevision: 5, requestCanonical: JSON.stringify(i.handoff) };
  assert.deepEqual(evaluateWriteBack(i, request()), { status: "HOLD", reason: "HANDOFF_NOT_READY" });
});

test("2 rejected result cannot be reused after receipt input is changed", () => {
  const i = input();
  i.result.executorId = "KIRA-1";
  assert.deepEqual(evaluateWriteBack(i, request()), { status: "HOLD", reason: "RESULT_NOT_ACCEPTED" });
});

test("3 consumed result cannot authorize a second write", () => {
  const i = input();
  i.consumedResultIds.add("RESULT-1");
  assert.deepEqual(evaluateWriteBack(i, request()), { status: "HOLD", reason: "RESULT_ALREADY_CONSUMED" });
});

test("4 consumed handoff cannot authorize a second write", () => {
  const i = input();
  i.consumedHandoffIds.add("HO-1");
  assert.deepEqual(evaluateWriteBack(i, request()), { status: "HOLD", reason: "HANDOFF_ALREADY_CONSUMED" });
});

test("5 candidate revision cannot skip parentRevision + 1", () => {
  const r = request();
  r.candidate.identity.stateRevision = 7;
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "REVISION_CONFLICT" });
});

test("6 candidate stateId must remain equal to parentStateId", () => {
  const r = request();
  r.candidate.identity.stateId = "CS-OTHER";
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "REVISION_CONFLICT" });
});

test("7 stale parent/CAS context fails closed", () => {
  const i = input(7);
  const r = request(5);
  assert.deepEqual(evaluateWriteBack(i, r), { status: "HOLD", reason: "PARENT_MISMATCH" });
});

test("8 candidate lineage cannot change during write back", () => {
  const r = request();
  r.candidate.identity.lineageId = "LINEAGE-OTHER";
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "REVISION_CONFLICT" });
});

test("9 candidate invariant is enforced", () => {
  const r = request();
  r.candidate.nextActionSingle.actionId = "";
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "CANDIDATE_INVARIANT_FAILED" });
});

test("10 activeRolesAndAuthority cannot be changed by write-back", () => {
  const r = request();
  r.candidate.activeRolesAndAuthority = { verifier: "ATTACKER" };
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "UNAUTHORIZED_STATE_MUTATION" });
});

test("11 humanDecisionFinal cannot be changed by write-back", () => {
  const r = request();
  r.candidate.humanDecisionFinal.shortDirective = "replace authority";
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "UNAUTHORIZED_STATE_MUTATION" });
});

test("12 nextActionSingle cannot be changed by write-back", () => {
  const r = request();
  r.candidate.nextActionSingle = { actionId: "NA-OTHER", description: "unauthorized" };
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "UNAUTHORIZED_STATE_MUTATION" });
});

test("13 effectiveAt cannot move backwards", () => {
  const r = request();
  r.candidate.identity.effectiveAt = "2026-09-10T17:59:59+09:00";
  assert.deepEqual(evaluateWriteBack(input(), r), { status: "HOLD", reason: "CANDIDATE_INVARIANT_FAILED" });
});

test("14 atomic commit projection preserves CAS, consumption IDs, and next CURRENT", () => {
  const r = request();
  assert.deepEqual(toWriteBackAtomicCommit(r), {
    expectedCurrent: r.cas,
    consumeResultId: "RESULT-1",
    consumeHandoffId: "HO-1",
    nextCurrent: r.candidate,
  });
});
