// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { issueVerifiedExecutionHandoffReceipt } from "../src/execution-handoff.js";
import {
  issueSideEffectPermit,
  isVerifiedSideEffectPermit,
  MAX_EGRESS_PERMIT_TTL_MS,
} from "../src/side-effect-fence.js";

const ref=(id="REF-1",expectedVersion="1",path="evidence/REF-1")=>({id,expectedVersion,path});
function snapshot(){return{identity:{stateId:"CS-1",schemaVersion:"0.1",stateRevision:7,effectiveAt:"2026-09-14T07:00:00+09:00",scope:"KIYUSAMA_OS_2",lineageId:"LINEAGE-MAIN-001"},humanDecisionFinal:{decisionId:"HD-1",sourceAuthority:"KIYUSAMA",shortDirective:"test"},mainLineTask:{taskId:"ML-1",description:"test"},nextActionSingle:{actionId:"NA-1",description:"external side effect"},activeRolesAndAuthority:{EXECUTION_AUTHORITY:"EXECUTOR-1"},activeGuards:[],confirmedRefIndex:[{...ref(),status:"VERIFIED"}],independentLaneHealth:{status:"VERIFIED",evidenceVerdict:"SUFFICIENT",observedAt:"2026-09-14T07:00:00+09:00",evidenceSource:"KIRA-1"}}}
function capabilitySlot(){return{slotId:"S-1",capabilityId:"CAP-A",status:"BOUND",binding:{capabilityId:"CAP-A",implementationId:"IMPL-1",source:"NATIVE",version:"1",verified:true}}}
function handoffInput(){return{snapshot:snapshot(),actionEvidenceRequirement:{actionId:"NA-1",requiredRefs:[ref()],requireIndependentLane:false},capabilitySlot:capabilitySlot(),gateDecision:{status:"ALLOW",actionId:"NA-1",stateId:"CS-1",stateRevision:7,role:"EXECUTION_AUTHORITY",actorAuthorityId:"EXECUTOR-1"}}}
function handoffRequest(){return{handoffId:"HO-1",traceId:"TRACE-1",actionId:"NA-1",sourceStateId:"CS-1",sourceStateRevision:7,requiredRole:"EXECUTION_AUTHORITY",executorAuthorityId:"EXECUTOR-1",capabilityId:"CAP-A",implementationId:"IMPL-1",issuedAt:"2026-09-14T07:00:00+09:00",expiresAt:"2026-09-14T08:00:00+09:00",evidenceRefs:[ref()],resultEvidencePolicy:{requiredRefs:[ref("REF-RESULT-1","1","evidence/REF-RESULT-1")],verifierId:"KIRA-1",evidenceSource:"KIRA-1"}}}
function verifiedHandoff(){const r=handoffRequest();const d=issueVerifiedExecutionHandoffReceipt(handoffInput(),r,"2026-09-14T07:05:00+09:00");assert.equal(d.status,"READY");return{request:r,receipt:d.receipt}}
function intent(){return{permitId:"PERMIT-1",handoffId:"HO-1",actionId:"NA-1",sourceStateId:"CS-1",sourceStateRevision:7,capabilityId:"CAP-A",workerId:"WORKER-3",workerEpoch:11,generation:42,effectClass:"EXTERNAL_MESSAGE",target:"slack:C0BLC7U76FR",operation:"chat.postMessage",issuedAt:"2026-09-14T07:10:00+09:00",expiresAt:"2026-09-14T07:15:00+09:00"}}
const worker={workerId:"WORKER-3",workerEpoch:11,generation:42};
const NOW="2026-09-14T07:12:00+09:00";
function base(overrides={}){const h=verifiedHandoff();return{handoffRequest:h.request,handoffReceipt:h.receipt,currentStateId:"CS-1",currentStateRevision:7,expectedWorker:worker,intent:intent(),now:NOW,...overrides}}

test("1 exact verified handoff issues a narrow permit",()=>{const d=issueSideEffectPermit(base());assert.equal(d.status,"PERMIT");assert.equal(d.permit.target,"slack:C0BLC7U76FR");assert.equal(d.permit.operation,"chat.postMessage")});
test("2 forged handoff receipt is rejected",()=>{const b=base();b.handoffReceipt={...b.handoffReceipt};assert.deepEqual(issueSideEffectPermit(b),{status:"HOLD",reason:"HANDOFF_NOT_VERIFIED"})});
test("3 CURRENT state id drift is rejected",()=>assert.deepEqual(issueSideEffectPermit(base({currentStateId:"CS-2"})),{status:"HOLD",reason:"CURRENT_BINDING_MISMATCH"}));
test("4 CURRENT state revision drift is rejected",()=>assert.deepEqual(issueSideEffectPermit(base({currentStateRevision:8})),{status:"HOLD",reason:"CURRENT_BINDING_MISMATCH"}));
test("5 action substitution is rejected",()=>{const b=base();b.intent.actionId="NA-ATTACK";assert.deepEqual(issueSideEffectPermit(b),{status:"HOLD",reason:"HANDOFF_BINDING_MISMATCH"})});
test("6 capability substitution is rejected",()=>{const b=base();b.intent.capabilityId="CAP-ATTACK";assert.deepEqual(issueSideEffectPermit(b),{status:"HOLD",reason:"HANDOFF_BINDING_MISMATCH"})});
test("7 stale worker epoch is rejected",()=>{const b=base();b.intent.workerEpoch=10;assert.deepEqual(issueSideEffectPermit(b),{status:"HOLD",reason:"WORKER_EPOCH_MISMATCH"})});
test("8 worker identity substitution is rejected",()=>{const b=base();b.intent.workerId="WORKER-ATTACK";assert.deepEqual(issueSideEffectPermit(b),{status:"HOLD",reason:"WORKER_EPOCH_MISMATCH"})});
test("9 stale generation is rejected",()=>{const b=base();b.intent.generation=41;assert.deepEqual(issueSideEffectPermit(b),{status:"HOLD",reason:"GENERATION_MISMATCH"})});
test("10 invalid worker epoch fails closed",()=>{const b=base();b.intent.workerEpoch=0;assert.deepEqual(issueSideEffectPermit(b),{status:"HOLD",reason:"WORKER_BINDING_INVALID"})});
test("11 empty egress target fails closed",()=>{const b=base();b.intent.target=" ";assert.deepEqual(issueSideEffectPermit(b),{status:"HOLD",reason:"EGRESS_BINDING_INVALID"})});
test("12 excessive permit lifetime is rejected",()=>{const b=base();b.intent.expiresAt=new Date(Date.parse(b.intent.issuedAt)+MAX_EGRESS_PERMIT_TTL_MS+1).toISOString();assert.deepEqual(issueSideEffectPermit(b),{status:"HOLD",reason:"INVALID_LIFETIME"})});
test("13 expired permit intent is rejected",()=>{const b=base();b.intent.expiresAt=NOW;assert.deepEqual(issueSideEffectPermit(b),{status:"HOLD",reason:"EXPIRED"})});
test("14 permit cannot be forged by shape",()=>{const b=base();const d=issueSideEffectPermit(b);assert.equal(d.status,"PERMIT");const forged={...d.permit};assert.equal(isVerifiedSideEffectPermit(forged,b.intent,NOW),false)});
test("15 verified permit is exact-intent bound and expires at dispatch",()=>{const b=base();const d=issueSideEffectPermit(b);assert.equal(d.status,"PERMIT");assert.equal(isVerifiedSideEffectPermit(d.permit,b.intent,NOW),true);const changed={...b.intent,target:"slack:OTHER"};assert.equal(isVerifiedSideEffectPermit(d.permit,changed,NOW),false);assert.equal(isVerifiedSideEffectPermit(d.permit,b.intent,"2026-09-14T07:15:00+09:00"),false)});
