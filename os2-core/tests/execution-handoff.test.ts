// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExecutionHandoff, MAX_EXECUTION_HANDOFF_TTL_MS } from "../src/execution-handoff.js";

const ref=(id="REF-1",expectedVersion="1",path="evidence/REF-1")=>({id,expectedVersion,path});
function snapshot(){return{identity:{stateId:"CS-1",schemaVersion:"0.1",stateRevision:1,effectiveAt:"2026-09-10T16:00:00+09:00",scope:"KIYUSAMA_OS_2",lineageId:"LINEAGE-MAIN-001"},humanDecisionFinal:{decisionId:"HD-1",sourceAuthority:"KIYUSAMA",shortDirective:"test"},mainLineTask:{taskId:"ML-1",description:"test"},nextActionSingle:{actionId:"NA-1",description:"execute"},activeRolesAndAuthority:{},activeGuards:[],confirmedRefIndex:[{...ref(),status:"VERIFIED"}],independentLaneHealth:{status:"VERIFIED",evidenceVerdict:"SUFFICIENT",observedAt:"2026-09-10T16:00:00+09:00",evidenceSource:"KIRA-1"}}}
function capabilitySlot(){return{slotId:"S-1",capabilityId:"CAP-A",status:"BOUND",binding:{capabilityId:"CAP-A",implementationId:"IMPL-1",source:"NATIVE",version:"1",verified:true}}}
function input(){return{snapshot:snapshot(),actionEvidenceRequirement:{actionId:"NA-1",requiredRefs:[ref()],requireIndependentLane:false},capabilitySlot:capabilitySlot(),gateDecision:{status:"ALLOW",actionId:"NA-1",stateId:"CS-1",stateRevision:1}}}
function request(){return{handoffId:"HO-1",traceId:"TRACE-1",actionId:"NA-1",sourceStateId:"CS-1",sourceStateRevision:1,capabilityId:"CAP-A",implementationId:"IMPL-1",issuedAt:"2026-09-10T16:00:00+09:00",expiresAt:"2026-09-10T17:00:00+09:00",evidenceRefs:[ref()],resultEvidencePolicy:{requiredRefs:[ref("REF-RESULT-1","1","evidence/REF-RESULT-1")],verifierId:"KIRA-1",evidenceSource:"KIRA-1"}}}
const NOW="2026-09-10T16:30:00+09:00";

test("1 ready with exact bindings",()=>assert.deepEqual(evaluateExecutionHandoff(input(),request(),NOW),{status:"READY"}));
test("2 gate not allowed",()=>{const i=input();i.gateDecision={status:"HOLD",reason:"ACTION_NOT_CURRENT"};assert.deepEqual(evaluateExecutionHandoff(i,request(),NOW),{status:"HOLD",reason:"GATE_NOT_ALLOWED"})});
test("3 capability not ready",()=>{const i=input();i.capabilitySlot={slotId:"S-1",capabilityId:"CAP-A",status:"EMPTY",binding:null};assert.deepEqual(evaluateExecutionHandoff(i,request(),NOW),{status:"HOLD",reason:"CAPABILITY_NOT_READY"})});
test("4 implementation mismatch",()=>{const r=request();r.implementationId="OTHER";assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"HANDOFF_MISMATCH"})});

test("5 changed sourceStateId is rejected by gate decision binding",()=>{const r=request();r.sourceStateId="CS-OLD";assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"GATE_DECISION_MISMATCH"})});
test("6 changed sourceStateRevision is rejected by gate decision binding",()=>{const r=request();r.sourceStateRevision=0;assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"GATE_DECISION_MISMATCH"})});
test("7 stale gateDecision.actionId is rejected",()=>{const i=input();i.gateDecision.actionId="NA-OLD";assert.deepEqual(evaluateExecutionHandoff(i,request(),NOW),{status:"HOLD",reason:"GATE_DECISION_MISMATCH"})});
test("8 stale gateDecision.stateRevision is rejected",()=>{const i=input();i.gateDecision.stateRevision=0;assert.deepEqual(evaluateExecutionHandoff(i,request(),NOW),{status:"HOLD",reason:"GATE_DECISION_MISMATCH"})});

test("9 missing prerequisite evidence binding",()=>{const r=request();r.evidenceRefs=[];assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"EVIDENCE_BINDING_MISMATCH"})});
test("10 prerequisite version substitution holds",()=>{const r=request();r.evidenceRefs=[ref("REF-1","2")];assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"EVIDENCE_BINDING_MISMATCH"})});
test("11 prerequisite path substitution holds",()=>{const r=request();r.evidenceRefs=[ref("REF-1","1","other")];assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"EVIDENCE_BINDING_MISMATCH"})});
test("12 snapshot version drift holds",()=>{const i=input();i.snapshot.confirmedRefIndex[0].expectedVersion="2";assert.deepEqual(evaluateExecutionHandoff(i,request(),NOW),{status:"HOLD",reason:"EVIDENCE_BINDING_MISMATCH"})});
test("13 snapshot path drift holds",()=>{const i=input();i.snapshot.confirmedRefIndex[0].path="other";assert.deepEqual(evaluateExecutionHandoff(i,request(),NOW),{status:"HOLD",reason:"EVIDENCE_BINDING_MISMATCH"})});
test("14 evidence no longer verified",()=>{const i=input();i.snapshot.confirmedRefIndex[0].status="UNVERIFIED_REF";assert.deepEqual(evaluateExecutionHandoff(i,request(),NOW),{status:"HOLD",reason:"EVIDENCE_NOT_VERIFIED"})});
test("15 invalid result evidence policy empty refs",()=>{const r=request();r.resultEvidencePolicy.requiredRefs=[];assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"RESULT_EVIDENCE_POLICY_INVALID"})});
test("16 invalid result evidence policy empty verifier",()=>{const r=request();r.resultEvidencePolicy.verifierId=" ";assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"RESULT_EVIDENCE_POLICY_INVALID"})});
test("17 duplicate result evidence refs fail closed",()=>{const r=request();r.resultEvidencePolicy.requiredRefs=[ref("R","1","p"),ref("R","1","p")];assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"RESULT_EVIDENCE_POLICY_INVALID"})});
test("18 required lane not ready",()=>{const i=input();i.actionEvidenceRequirement.requireIndependentLane=true;i.snapshot.independentLaneHealth.status="UNVERIFIED";assert.deepEqual(evaluateExecutionHandoff(i,request(),NOW),{status:"HOLD",reason:"INDEPENDENT_LANE_NOT_READY"})});
test("19 excessive TTL",()=>{const r=request();r.expiresAt=new Date(Date.parse(r.issuedAt)+MAX_EXECUTION_HANDOFF_TTL_MS+1).toISOString();assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"INVALID_LIFETIME"})});
test("20 future issuance",()=>{const r=request();r.issuedAt="2026-09-10T16:45:00+09:00";assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"INVALID_LIFETIME"})});
test("21 expired",()=>{const r=request();r.expiresAt=NOW;assert.deepEqual(evaluateExecutionHandoff(input(),r,NOW),{status:"HOLD",reason:"EXPIRED"})});
