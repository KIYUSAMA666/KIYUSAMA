// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import type { BusDeliveryRecord, BusMessage } from "../src/ai-communication-bus-core.js";
import { createSupabaseBusPersistencePort } from "../src/ai-communication-bus-supabase-persistence-port.js";
import type { TransportEvidence } from "../src/ai-communication-bus-transport-evidence.js";
import { issueVerifiedExecutionHandoffReceipt } from "../src/execution-handoff.js";
import { issueSideEffectPermit } from "../src/side-effect-fence.js";

const message: BusMessage = {
  messageId: "msg-1",
  traceId: "trace-1",
  kind: "MESSAGE",
  sourceAgentId: "SORA",
  targetAgentId: "KIRA",
  parentMessageId: null,
  current: { stateId: "state-1", stateRevision: 7 },
  createdAt: "2026-09-13T13:00:00.000Z",
  payload: { purpose: "test" },
};
const delivery: BusDeliveryRecord = { message, status: "DELIVERED", deliveredToAgentId: "KIRA", acknowledgedByAgentId: null };
const evidence: TransportEvidence = { provider: "SLACK", providerDeliveryId: "1789302184.338689", messageId: "msg-1", traceId: "trace-1", targetAgentId: "KIRA", observedAt: "2026-09-13T13:00:01.000Z", status: "DELIVERED" };
const ref=(id="REF-PERSIST",expectedVersion="1",path="evidence/REF-PERSIST")=>({id,expectedVersion,path});
function snapshot(revision=7){return{identity:{stateId:"state-1",schemaVersion:"0.1",stateRevision:revision,effectiveAt:"2026-09-13T13:00:00Z",scope:"KIYUSAMA_OS_2",lineageId:"LINEAGE-MAIN-001"},humanDecisionFinal:{decisionId:"HD-PERSIST",sourceAuthority:"KIYUSAMA",shortDirective:"persist bus"},mainLineTask:{taskId:"ML-PERSIST",description:"persist bus"},nextActionSingle:{actionId:"NA-PERSIST",description:"persist bus"},activeRolesAndAuthority:{EXECUTION_AUTHORITY:"EXECUTOR-1"},activeGuards:[],confirmedRefIndex:[{...ref(),status:"VERIFIED"}],independentLaneHealth:{status:"VERIFIED",evidenceVerdict:"SUFFICIENT",observedAt:"2026-09-13T13:00:00Z",evidenceSource:"KIRA-1"}}}
function persistenceFence(overrides={}){
 const s=snapshot(); const handoffInput={snapshot:s,actionEvidenceRequirement:{actionId:"NA-PERSIST",requiredRefs:[ref()],requireIndependentLane:false},capabilitySlot:{slotId:"S-PERSIST",capabilityId:"CAP-PERSIST",status:"BOUND",binding:{capabilityId:"CAP-PERSIST",implementationId:"IMPL-PERSIST",source:"NATIVE",version:"1",verified:true}},gateDecision:{status:"ALLOW",actionId:"NA-PERSIST",stateId:"state-1",stateRevision:7,role:"EXECUTION_AUTHORITY",actorAuthorityId:"EXECUTOR-1"}};
 const handoffRequest={handoffId:"HO-PERSIST",traceId:"TRACE-PERSIST",actionId:"NA-PERSIST",sourceStateId:"state-1",sourceStateRevision:7,requiredRole:"EXECUTION_AUTHORITY",executorAuthorityId:"EXECUTOR-1",capabilityId:"CAP-PERSIST",implementationId:"IMPL-PERSIST",issuedAt:"2026-09-13T12:59:00Z",expiresAt:"2026-09-13T13:30:00Z",evidenceRefs:[ref()],resultEvidencePolicy:{requiredRefs:[ref("REF-PERSIST-RESULT","1","evidence/REF-PERSIST-RESULT")],verifierId:"KIRA-1",evidenceSource:"KIRA-1"}};
 const handoff=issueVerifiedExecutionHandoffReceipt(handoffInput,handoffRequest,"2026-09-13T13:00:00Z"); assert.equal(handoff.status,"READY"); if(handoff.status!=="READY")assert.fail();
 const intent={permitId:"PERMIT-PERSIST",handoffId:"HO-PERSIST",actionId:"NA-PERSIST",sourceStateId:"state-1",sourceStateRevision:7,capabilityId:"CAP-PERSIST",workerId:"WORKER-3",workerEpoch:12,generation:43,effectClass:"PRODUCTION_WRITE",target:`supabase-bus:${message.messageId}`,operation:"os2_bus_persist_delivered_with_transport",issuedAt:"2026-09-13T13:00:01Z",expiresAt:"2026-09-13T13:05:01Z",...overrides};
 const decision=issueSideEffectPermit({handoffRequest,handoffReceipt:handoff.receipt,currentStateProvider:{readCurrentState:()=>s},expectedWorker:{workerId:"WORKER-3",workerEpoch:12,generation:43},intent,now:"2026-09-13T13:00:02Z"}); assert.equal(decision.status,"PERMIT"); if(decision.status!=="PERMIT")assert.fail(); return{permit:decision.permit,intent,dispatchNow:"2026-09-13T13:00:03Z"};
}
function client(calls){return{async rpc(functionName,args){calls.push({functionName,args});return{data:{status:"STORED",storedMessageId:message.messageId,storedTraceId:message.traceId,storedProviderDeliveryId:evidence.providerDeliveryId},error:null};}}}

test("verified PRODUCTION_WRITE permit reaches exact atomic BUS persistence RPC",async()=>{const calls=[];const port=createSupabaseBusPersistencePort(client(calls),persistenceFence());const result=await port.persistBusAndTransport({message,delivery,evidence});assert.equal(result.ok,true);assert.equal(calls.length,1);assert.equal(calls[0].functionName,"os2_bus_persist_delivered_with_transport");});
test("forged permit blocks RPC",async()=>{const calls=[];const fence=persistenceFence();const port=createSupabaseBusPersistencePort(client(calls),{...fence,permit:{...fence.permit}});assert.deepEqual(await port.persistBusAndTransport({message,delivery,evidence}),{ok:false});assert.equal(calls.length,0);});
test("wrong persistence target blocks RPC",async()=>{const calls=[];const fence=persistenceFence();const port=createSupabaseBusPersistencePort(client(calls),{...fence,intent:{...fence.intent,target:"supabase-bus:other"}});assert.deepEqual(await port.persistBusAndTransport({message,delivery,evidence}),{ok:false});assert.equal(calls.length,0);});
test("wrong operation blocks RPC",async()=>{const calls=[];const fence=persistenceFence();const port=createSupabaseBusPersistencePort(client(calls),{...fence,intent:{...fence.intent,operation:"other_rpc"}});assert.deepEqual(await port.persistBusAndTransport({message,delivery,evidence}),{ok:false});assert.equal(calls.length,0);});
test("wrong effect class blocks RPC",async()=>{const calls=[];const fence=persistenceFence();const port=createSupabaseBusPersistencePort(client(calls),{...fence,intent:{...fence.intent,effectClass:"EXTERNAL_MUTATION"}});assert.deepEqual(await port.persistBusAndTransport({message,delivery,evidence}),{ok:false});assert.equal(calls.length,0);});
test("expired permit at dispatch blocks RPC",async()=>{const calls=[];const fence=persistenceFence();const port=createSupabaseBusPersistencePort(client(calls),{...fence,dispatchNow:"2026-09-13T13:06:00Z"});assert.deepEqual(await port.persistBusAndTransport({message,delivery,evidence}),{ok:false});assert.equal(calls.length,0);});
test("message CURRENT substitution blocks RPC even with genuine permit",async()=>{const calls=[];const fence=persistenceFence();const port=createSupabaseBusPersistencePort(client(calls),fence);assert.deepEqual(await port.persistBusAndTransport({message:{...message,current:{...message.current,stateRevision:8}},delivery,evidence}),{ok:false});assert.equal(calls.length,0);});
