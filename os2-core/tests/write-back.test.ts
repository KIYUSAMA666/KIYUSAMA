// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWriteBack, toWriteBackAtomicCommit } from "../src/write-back.js";

function current(revision = 5) { return {
  identity:{stateId:"CS-1",schemaVersion:"0.1",stateRevision:revision,effectiveAt:"2026-09-10T18:00:00+09:00",scope:"KIYUSAMA_OS_2",lineageId:"LINEAGE-MAIN-001"},
  humanDecisionFinal:{decisionId:"HD-1",sourceAuthority:"KIYUSAMA",shortDirective:"write back test"},
  mainLineTask:{taskId:"ML-1",description:"test"}, nextActionSingle:{actionId:"NA-1",description:"write current"},
  activeRolesAndAuthority:{}, activeGuards:[], confirmedRefIndex:[],
  independentLaneHealth:{status:"VERIFIED",evidenceVerdict:"SUFFICIENT",observedAt:"2026-09-10T18:00:00+09:00",evidenceSource:"KIRA"}
}; }
function handoff(revision=5){return {handoffId:"HO-1",traceId:"TRACE-1",actionId:"NA-1",sourceStateId:"CS-1",sourceStateRevision:revision,capabilityId:"CAP-A",implementationId:"IMPL-1",issuedAt:"2026-09-10T18:00:00+09:00",expiresAt:"2026-09-10T19:00:00+09:00",evidenceRefs:[],resultEvidencePolicy:{requiredRefs:[],verifierId:"KIRA-1",evidenceSource:"KIRA"}};}
function result(revision=5){return {resultId:"RESULT-1",handoffId:"HO-1",traceId:"TRACE-1",actionId:"NA-1",sourceStateId:"CS-1",sourceStateRevision:revision,capabilityId:"CAP-A",implementationId:"IMPL-1",executorId:"EXECUTOR-1",verifierId:"KIRA-1",outcome:"SUCCEEDED",providerExecutionId:"PROVIDER-1",observedAt:"2026-09-10T18:30:00+09:00",evidenceRefIds:["REF-1"],verification:"VERIFIED"};}
function candidate(parentRevision=5){return {...current(parentRevision+1),identity:{...current(parentRevision+1).identity,stateId:"CS-1",stateRevision:parentRevision+1,lineageId:"LINEAGE-MAIN-001",scope:"KIYUSAMA_OS_2"},writeBack:{parent:{parentStateId:"CS-1",parentRevision},source:{sourceResultId:"RESULT-1",sourceHandoffId:"HO-1"}}};}
function request(parentRevision=5){return {writeBackId:"WB-1",parent:{parentStateId:"CS-1",parentRevision},source:{sourceResultId:"RESULT-1",sourceHandoffId:"HO-1"},consumption:{resultConsumptionKey:"RESULT-1",handoffConsumptionKey:"HO-1"},cas:{expectedCurrentStateId:"CS-1",expectedCurrentRevision:parentRevision},candidate:candidate(parentRevision)};}
function input(revision=5){return {current:current(revision),handoff:handoff(revision),handoffDecision:{status:"READY",handoffId:"HO-1",actionId:"NA-1",sourceStateId:"CS-1",sourceStateRevision:revision},result:result(revision),resultDecision:{status:"ACCEPTED",outcome:"SUCCEEDED",resultId:"RESULT-1",handoffId:"HO-1",sourceStateId:"CS-1",sourceStateRevision:revision},consumedResultIds:new Set(),consumedHandoffIds:new Set()};}

test("0 valid write-back is READY",()=>assert.equal(evaluateWriteBack(input(),request()).status,"READY"));
test("1 consumed result is HOLD",()=>{const i=input();i.consumedResultIds.add("RESULT-1");assert.equal(evaluateWriteBack(i,request()).status,"HOLD");});
test("2 consumed handoff is HOLD",()=>{const i=input();i.consumedHandoffIds.add("HO-1");assert.equal(evaluateWriteBack(i,request()).status,"HOLD");});
test("3 skipped revision is HOLD",()=>{const r=request();r.candidate.identity.stateRevision=7;assert.equal(evaluateWriteBack(input(),r).status,"HOLD");});
test("4 changed stateId is HOLD",()=>{const r=request();r.candidate.identity.stateId="CS-OTHER";assert.equal(evaluateWriteBack(input(),r).status,"HOLD");});
test("5 stale parent is HOLD",()=>assert.equal(evaluateWriteBack(input(7),request(5)).status,"HOLD"));
test("6 handoff from another state is HOLD",()=>{const i=input();i.handoff.sourceStateId="CS-OTHER";assert.equal(evaluateWriteBack(i,request()).status,"HOLD");});
test("7 resultId comparison exact",()=>{const i=input();i.result.resultId="result-1";assert.equal(evaluateWriteBack(i,request()).status,"HOLD");});
test("8 lineage change is HOLD",()=>{const r=request();r.candidate.identity.lineageId="LINEAGE-OTHER";assert.equal(evaluateWriteBack(input(),r).status,"HOLD");});
test("9 atomic projection preserves bindings",()=>{const r=request();assert.deepEqual(toWriteBackAtomicCommit(r),{expectedCurrent:r.cas,consumeResultId:"RESULT-1",consumeHandoffId:"HO-1",nextCurrent:r.candidate});});

test("10 rejected result cannot bypass Result Evidence into WRITE BACK",()=>{const i=input();i.result.executorId="KIRA-1";i.resultDecision={status:"HOLD",reason:"SELF_VERIFICATION_FORBIDDEN"};assert.deepEqual(evaluateWriteBack(i,request()),{status:"HOLD",reason:"RESULT_NOT_ACCEPTED"});});
test("11 rejected handoff cannot bypass Handoff into WRITE BACK",()=>{const i=input();i.handoffDecision={status:"HOLD",reason:"EXPIRED"};assert.deepEqual(evaluateWriteBack(i,request()),{status:"HOLD",reason:"HANDOFF_NOT_READY"});});
test("12 invalid CurrentState candidate invariant is enforced",()=>{const r=request();r.candidate.nextActionSingle.actionId="";assert.deepEqual(evaluateWriteBack(input(),r),{status:"HOLD",reason:"INVALID_CANDIDATE"});});
test("13 human authority cannot be rewritten by WRITE BACK",()=>{const r=request();r.candidate.humanDecisionFinal.shortDirective="ATTACK";assert.deepEqual(evaluateWriteBack(input(),r),{status:"HOLD",reason:"PROTECTED_STATE_MUTATION"});});
test("14 next action cannot be rewritten by WRITE BACK",()=>{const r=request();r.candidate.nextActionSingle={actionId:"ATTACK",description:"take over"};assert.deepEqual(evaluateWriteBack(input(),r),{status:"HOLD",reason:"PROTECTED_STATE_MUTATION"});});
test("15 active roles and authority cannot be rewritten by WRITE BACK",()=>{const r=request();r.candidate.activeRolesAndAuthority={ATTACKER:"FINAL_AUTHORITY"};assert.deepEqual(evaluateWriteBack(input(),r),{status:"HOLD",reason:"PROTECTED_STATE_MUTATION"});});
test("16 schemaVersion cannot be rewritten by WRITE BACK",()=>{const r=request();r.candidate.identity.schemaVersion="evil";assert.deepEqual(evaluateWriteBack(input(),r),{status:"HOLD",reason:"PROTECTED_STATE_MUTATION"});});

test("17 forged READY for another handoff cannot authorize this handoff",()=>{const i=input();i.handoff.expiresAt="2026-09-10T17:00:00+09:00";i.handoffDecision={status:"READY",handoffId:"HO-OTHER",actionId:"NA-1",sourceStateId:"CS-1",sourceStateRevision:5};assert.deepEqual(evaluateWriteBack(i,request()),{status:"HOLD",reason:"HANDOFF_DECISION_MISMATCH"});});
test("18 forged READY with wrong source revision cannot authorize handoff",()=>{const i=input();i.handoffDecision={...i.handoffDecision,sourceStateRevision:4};assert.deepEqual(evaluateWriteBack(i,request()),{status:"HOLD",reason:"HANDOFF_DECISION_MISMATCH"});});
test("19 forged ACCEPTED for another result cannot authorize this result",()=>{const i=input();i.result.executorId="KIRA-1";i.resultDecision={status:"ACCEPTED",outcome:"SUCCEEDED",resultId:"RESULT-OTHER",handoffId:"HO-1",sourceStateId:"CS-1",sourceStateRevision:5};assert.deepEqual(evaluateWriteBack(i,request()),{status:"HOLD",reason:"RESULT_DECISION_MISMATCH"});});
test("20 forged ACCEPTED with wrong outcome cannot authorize result",()=>{const i=input();i.resultDecision={...i.resultDecision,outcome:"FAILED"};assert.deepEqual(evaluateWriteBack(i,request()),{status:"HOLD",reason:"RESULT_DECISION_MISMATCH"});});
