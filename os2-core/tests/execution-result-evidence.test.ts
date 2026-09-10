// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExecutionResultEvidence } from "../src/execution-result-evidence.js";

const ref=(id="REF-RESULT-1",expectedVersion="1",path="evidence/REF-RESULT-1")=>({id,expectedVersion,path});
function snapshot(){return{identity:{stateId:"CS-1",schemaVersion:"0.1",stateRevision:1,effectiveAt:"2026-09-10T16:00:00+09:00",scope:"KIYUSAMA_OS_2",lineageId:"LINEAGE-MAIN-001"},humanDecisionFinal:{decisionId:"HD-1",sourceAuthority:"KIYUSAMA",shortDirective:"test"},mainLineTask:{taskId:"ML-1",description:"test"},nextActionSingle:{actionId:"NA-1",description:"execute"},activeRolesAndAuthority:{},activeGuards:[],confirmedRefIndex:[{...ref(),status:"VERIFIED"}],independentLaneHealth:{status:"VERIFIED",evidenceVerdict:"SUFFICIENT",observedAt:"2026-09-10T16:00:00+09:00",evidenceSource:"KIRA-1"}}}
function handoff(){return{handoffId:"HO-1",traceId:"TRACE-1",actionId:"NA-1",sourceStateId:"CS-1",sourceStateRevision:1,capabilityId:"CAP-A",implementationId:"IMPL-1",issuedAt:"2026-09-10T16:00:00+09:00",expiresAt:"2026-09-10T17:00:00+09:00",evidenceRefs:[{id:"REF-HANDOFF-1",expectedVersion:"1",path:"evidence/REF-HANDOFF-1"}],resultEvidencePolicy:{requiredRefs:[ref()],verifierId:"KIRA-1",evidenceSource:"KIRA-1"}}}
function evidence(){return{resultId:"RESULT-1",handoffId:"HO-1",traceId:"TRACE-1",actionId:"NA-1",sourceStateId:"CS-1",sourceStateRevision:1,capabilityId:"CAP-A",implementationId:"IMPL-1",executorId:"EXECUTOR-1",verifierId:"KIRA-1",outcome:"SUCCEEDED",providerExecutionId:"PROVIDER-1",observedAt:"2026-09-10T16:20:00+09:00",evidenceRefIds:["REF-RESULT-1"],verification:"VERIFIED"}}
function input(){return{snapshot:snapshot(),handoff:handoff(),evidence:evidence()}}

test("1 verified succeeded exact-bound result accepted",()=>assert.deepEqual(evaluateExecutionResultEvidence(input()),{status:"ACCEPTED",outcome:"SUCCEEDED"}));
test("2 failed observed outcome accepted",()=>{const i=input();i.evidence.outcome="FAILED";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"ACCEPTED",outcome:"FAILED"})});
test("3 self verification forbidden",()=>{const i=input();i.evidence.verifierId=i.evidence.executorId;i.handoff.resultEvidencePolicy.verifierId=i.evidence.executorId;assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"SELF_VERIFICATION_FORBIDDEN"})});
test("4 verifier substitution holds",()=>{const i=input();i.evidence.verifierId="KIRA-OTHER";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"VERIFIER_BINDING_MISMATCH"})});
test("5 lane source substitution holds",()=>{const i=input();i.snapshot.independentLaneHealth.evidenceSource="OTHER-LANE";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"EVIDENCE_SOURCE_MISMATCH"})});
test("6 result ref not declared by handoff holds",()=>{const i=input();i.evidence.evidenceRefIds=["REF-OTHER"];assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"RESULT_EVIDENCE_BINDING_MISMATCH"})});
test("7 missing declared result ref holds",()=>{const i=input();i.evidence.evidenceRefIds=[];assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"RESULT_EVIDENCE_MISSING"})});
test("8 duplicate result ref ids hold",()=>{const i=input();i.evidence.evidenceRefIds=["REF-RESULT-1","REF-RESULT-1"];assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"RESULT_EVIDENCE_BINDING_MISMATCH"})});
test("9 result ref missing from snapshot holds",()=>{const i=input();i.snapshot.confirmedRefIndex=[];assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"RESULT_EVIDENCE_MISSING"})});
test("10 result ref unverified holds",()=>{const i=input();i.snapshot.confirmedRefIndex[0].status="UNVERIFIED_REF";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"RESULT_EVIDENCE_UNVERIFIED"})});
test("11 expectedVersion substitution holds",()=>{const i=input();i.snapshot.confirmedRefIndex[0].expectedVersion="2";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"RESULT_EVIDENCE_BINDING_MISMATCH"})});
test("12 path substitution holds",()=>{const i=input();i.snapshot.confirmedRefIndex[0].path="other";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"RESULT_EVIDENCE_BINDING_MISMATCH"})});
test("13 independent lane not ready holds",()=>{const i=input();i.snapshot.independentLaneHealth.status="UNVERIFIED";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"INDEPENDENT_LANE_NOT_READY"})});
test("14 handoff mismatch holds",()=>{const i=input();i.evidence.handoffId="OTHER";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"HANDOFF_MISMATCH"})});
test("15 state mismatch holds",()=>{const i=input();i.evidence.sourceStateRevision=0;assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"STATE_MISMATCH"})});
test("16 invalid observedAt holds",()=>{const i=input();i.evidence.observedAt="bad";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"INVALID_RESULT"})});
test("17 before handoff window holds",()=>{const i=input();i.evidence.observedAt="2026-09-10T15:59:59+09:00";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"OBSERVED_AT_OUT_OF_WINDOW"})});
test("18 after handoff window holds",()=>{const i=input();i.evidence.observedAt="2026-09-10T17:00:01+09:00";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"OBSERVED_AT_OUT_OF_WINDOW"})});
test("19 conflict holds",()=>{const i=input();i.evidence.verification="CONFLICT";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"RESULT_CONFLICT"})});
test("20 unknown outcome holds",()=>{const i=input();i.evidence.outcome="UNKNOWN";assert.deepEqual(evaluateExecutionResultEvidence(i),{status:"HOLD",reason:"RESULT_UNKNOWN"})});
