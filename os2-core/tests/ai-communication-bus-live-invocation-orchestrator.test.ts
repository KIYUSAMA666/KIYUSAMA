// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import type { BusMessage } from "../src/ai-communication-bus-core.js";
import type { KiraWakeBridgeRecord } from "../src/ai-communication-bus-kira-wake-bridge.js";
import { issueVerifiedExecutionHandoffReceipt } from "../src/execution-handoff.js";
import { issueSideEffectPermit } from "../src/side-effect-fence.js";
import {
  runLiveBusInvocation,
  type LiveBusInvocationPorts,
} from "../src/ai-communication-bus-live-invocation-orchestrator.js";

const message: BusMessage = {
  messageId: "bus-live-orchestrator-01",
  traceId: "trace-live-orchestrator-01",
  kind: "MESSAGE",
  sourceAgentId: "SORA",
  targetAgentId: "KIRA",
  parentMessageId: null,
  current: { stateId: "room-v1", stateRevision: 7 },
  createdAt: "2026-09-13T12:00:00Z",
  payload: { type: "LIVE_BUS_INVOCATION_TEST" },
};

const wakeId = "259c01c3-8c82-47ee-affc-6aa2b1254735";
const replyId = "d2705df9-0e52-44e0-bfec-db2e2a87551d";

function confirmedWake(): KiraWakeBridgeRecord {
  return {
    messageId: message.messageId,
    traceId: message.traceId,
    targetAgentId: "KIRA",
    current: structuredClone(message.current),
    status: "CONFIRMED",
    wakeMessageId: wakeId,
    deploymentRunId: "run-1",
    sessionId: "session-1",
    observedAt: "2026-09-13T12:00:03Z",
  };
}

function exactPorts(events: string[]): LiveBusInvocationPorts {
  return {
    async persistBusAndTransport(input) {
      events.push("persist");
      return {
        ok: true,
        storedMessageId: input.message.messageId,
        storedTraceId: input.message.traceId,
        storedProviderDeliveryId: input.evidence.providerDeliveryId ?? undefined,
      };
    },
    async loadExistingWake() {
      events.push("load-existing-wake");
      return null;
    },
    async enqueueManagedWake() {
      events.push("enqueue");
      return {
        ok: true,
        message_id: wakeId,
        status: "NEW",
        trust_class: "AUTHENTICATED_INTERNAL",
        instruction_scope: "MANAGED_WAKE",
      };
    },
    async executeManagedWake(id) {
      events.push(`execute:${id}`);
      return {
        ok: true,
        trace_authentication: {
          device_model: "KIRA-BC",
          executed_function: "kira-managed-wake-executor-v1",
          message_id: wakeId,
          receiver_execution_id: "exec-1",
          agent_id: "agent-1",
          environment_id: "env-1",
          reply_message_id: replyId,
          deployment_run_id: "run-1",
          session_id: "session-1",
        },
      };
    },
  };
}

const ref=(id="REF-WAKE",expectedVersion="1",path="evidence/REF-WAKE")=>({id,expectedVersion,path});
function currentSnapshot(revision=7){return{identity:{stateId:"room-v1",schemaVersion:"0.1",stateRevision:revision,effectiveAt:"2026-09-13T12:00:00Z",scope:"KIYUSAMA_OS_2",lineageId:"LINEAGE-MAIN-001"},humanDecisionFinal:{decisionId:"HD-WAKE",sourceAuthority:"KIYUSAMA",shortDirective:"managed wake test"},mainLineTask:{taskId:"ML-WAKE",description:"managed wake"},nextActionSingle:{actionId:"NA-WAKE",description:"execute managed wake"},activeRolesAndAuthority:{EXECUTION_AUTHORITY:"EXECUTOR-1"},activeGuards:[],confirmedRefIndex:[{...ref(),status:"VERIFIED"}],independentLaneHealth:{status:"VERIFIED",evidenceVerdict:"SUFFICIENT",observedAt:"2026-09-13T12:00:00Z",evidenceSource:"KIRA-1"}}}
function wakeFence() {
  const snapshot=currentSnapshot();
  const handoffInput={snapshot,actionEvidenceRequirement:{actionId:"NA-WAKE",requiredRefs:[ref()],requireIndependentLane:false},capabilitySlot:{slotId:"S-WAKE",capabilityId:"CAP-WAKE",status:"BOUND",binding:{capabilityId:"CAP-WAKE",implementationId:"IMPL-WAKE",source:"NATIVE",version:"1",verified:true}},gateDecision:{status:"ALLOW",actionId:"NA-WAKE",stateId:"room-v1",stateRevision:7,role:"EXECUTION_AUTHORITY",actorAuthorityId:"EXECUTOR-1"}};
  const handoffRequest={handoffId:"HO-WAKE",traceId:"TRACE-WAKE",actionId:"NA-WAKE",sourceStateId:"room-v1",sourceStateRevision:7,requiredRole:"EXECUTION_AUTHORITY",executorAuthorityId:"EXECUTOR-1",capabilityId:"CAP-WAKE",implementationId:"IMPL-WAKE",issuedAt:"2026-09-13T11:59:00Z",expiresAt:"2026-09-13T13:00:00Z",evidenceRefs:[ref()],resultEvidencePolicy:{requiredRefs:[ref("REF-WAKE-RESULT","1","evidence/REF-WAKE-RESULT")],verifierId:"KIRA-1",evidenceSource:"KIRA-1"}};
  const handoff=issueVerifiedExecutionHandoffReceipt(handoffInput,handoffRequest,"2026-09-13T12:00:00Z");
  assert.equal(handoff.status,"READY");
  if(handoff.status!=="READY") assert.fail("handoff not ready");
  const intent={permitId:"PERMIT-WAKE",handoffId:"HO-WAKE",actionId:"NA-WAKE",sourceStateId:"room-v1",sourceStateRevision:7,capabilityId:"CAP-WAKE",workerId:"WORKER-3",workerEpoch:11,generation:42,effectClass:"EXTERNAL_MUTATION",target:`managed-wake:${wakeId}`,operation:"executeManagedWake",issuedAt:"2026-09-13T12:00:01Z",expiresAt:"2026-09-13T12:05:01Z"};
  const permitDecision=issueSideEffectPermit({handoffRequest,handoffReceipt:handoff.receipt,currentStateProvider:{readCurrentState:()=>currentSnapshot()},expectedWorker:{workerId:"WORKER-3",workerEpoch:11,generation:42},intent,now:"2026-09-13T12:00:02Z"});
  assert.equal(permitDecision.status,"PERMIT");
  if(permitDecision.status!=="PERMIT") assert.fail("permit not issued");
  return {permit:permitDecision.permit,intent,dispatchNow:"2026-09-13T12:00:03Z"};
}

function baseInput(ports: LiveBusInvocationPorts) {
  return {
    message,
    expectedSlackChannelId: "C0BLC7U76FR",
    slackSendResult: {
      channelId: "C0BLC7U76FR",
      messageTs: "1789302184.338689",
      messageLink: "https://kiyusama.slack.com/archives/C0BLC7U76FR/p1789302184338689",
    },
    slackObservedAt: "2026-09-13T12:00:01Z",
    wakeEnqueueObservedAt: "2026-09-13T12:00:02Z",
    wakeExecutionObservedAt: "2026-09-13T12:00:03Z",
    wakeExecutionFence: wakeFence(),
    ports,
  };
}

test("runs exact persistence -> recovery lookup -> enqueue -> fenced executor sequence and confirms", async () => {
  const events: string[] = [];
  const decision = await runLiveBusInvocation(baseInput(exactPorts(events)));
  assert.equal(decision.status, "CONFIRMED");
  assert.deepEqual(events, ["persist", "load-existing-wake", "enqueue", `execute:${wakeId}`]);
  if (decision.status !== "CONFIRMED") assert.fail("expected CONFIRMED");
  assert.equal(decision.evidence.providerDeliveryId, "1789302184.338689");
  assert.equal(decision.wake.status, "CONFIRMED");
});

test("ambiguous Slack result stops before all external ports", async () => {
  const events: string[] = [];
  const input = baseInput(exactPorts(events));
  const decision = await runLiveBusInvocation({ ...input, slackSendResult: null });
  assert.deepEqual(decision, { status: "UNKNOWN", stage: "SLACK_EVIDENCE", reason: "SLACK_SEND_RESULT_AMBIGUOUS" });
  assert.deepEqual(events, []);
});

test("wrong Slack channel fails closed before persistence", async () => {
  const events: string[] = [];
  const input = baseInput(exactPorts(events));
  const decision = await runLiveBusInvocation({ ...input, slackSendResult: { ...input.slackSendResult, channelId: "C-WRONG" } });
  assert.deepEqual(decision, { status: "HOLD", stage: "SLACK_EVIDENCE", reason: "SLACK_CHANNEL_MISMATCH" });
  assert.deepEqual(events, []);
});

test("invalid root MESSAGE fails before transport handling", async () => {
  const events: string[] = [];
  const input = baseInput(exactPorts(events));
  const decision = await runLiveBusInvocation({ ...input, message: { ...message, parentMessageId: "forged-parent" } });
  assert.deepEqual(decision, { status: "HOLD", stage: "BUS_MESSAGE", reason: "INVALID_MESSAGE" });
  assert.deepEqual(events, []);
});

test("persistence binding mismatch prevents recovery lookup and wake enqueue", async () => {
  const events: string[] = [];
  const ports = exactPorts(events);
  ports.persistBusAndTransport = async () => { events.push("persist"); return { ok:true, storedMessageId:"other-message", storedTraceId:message.traceId, storedProviderDeliveryId:"1789302184.338689" }; };
  const decision = await runLiveBusInvocation(baseInput(ports));
  assert.deepEqual(decision, { status:"HOLD", stage:"PERSISTENCE", reason:"PERSISTENCE_BINDING_MISMATCH" });
  assert.deepEqual(events,["persist"]);
});

test("exact confirmed replay reuses existing wake and never enqueues twice", async () => {
  const events: string[]=[]; const ports=exactPorts(events); ports.loadExistingWake=async()=>{events.push("load-existing-wake");return confirmedWake();};
  const decision=await runLiveBusInvocation(baseInput(ports)); assert.equal(decision.status,"CONFIRMED"); if(decision.status!=="CONFIRMED") assert.fail("expected CONFIRMED"); assert.equal(decision.wake.wakeMessageId,wakeId); assert.deepEqual(events,["persist","load-existing-wake"]);
});

test("conflicting existing wake binding fails closed before enqueue", async () => {
  const events:string[]=[]; const ports=exactPorts(events); ports.loadExistingWake=async()=>{events.push("load-existing-wake");return{...confirmedWake(),traceId:"foreign-trace"};};
  const decision=await runLiveBusInvocation(baseInput(ports)); assert.deepEqual(decision,{status:"HOLD",stage:"WAKE_RECOVERY",reason:"EXISTING_WAKE_BINDING_MISMATCH"}); assert.deepEqual(events,["persist","load-existing-wake"]);
});

test("non-confirmed existing wake requires explicit recovery and never enqueues twice", async () => {
  const events:string[]=[]; const ports=exactPorts(events); ports.loadExistingWake=async()=>{events.push("load-existing-wake");return{...confirmedWake(),status:"UNKNOWN",deploymentRunId:null,sessionId:null};};
  const decision=await runLiveBusInvocation(baseInput(ports)); assert.deepEqual(decision,{status:"HOLD",stage:"WAKE_RECOVERY",reason:"EXISTING_WAKE_REQUIRES_RECOVERY"}); assert.deepEqual(events,["persist","load-existing-wake"]);
});

test("forged MANAGED_WAKE enqueue receipt prevents executor call", async () => {
  const events:string[]=[]; const ports=exactPorts(events); ports.enqueueManagedWake=async()=>{events.push("enqueue");return{ok:true,message_id:"not-a-uuid",status:"NEW",trust_class:"AUTHENTICATED_INTERNAL",instruction_scope:"MANAGED_WAKE"};};
  const decision=await runLiveBusInvocation(baseInput(ports)); assert.deepEqual(decision,{status:"HOLD",stage:"WAKE_ENQUEUE",reason:"INVALID_WAKE_EVIDENCE"}); assert.deepEqual(events,["persist","load-existing-wake","enqueue"]);
});

test("ambiguous executor result remains UNKNOWN", async () => {
  const events:string[]=[]; const ports=exactPorts(events); ports.executeManagedWake=async(id)=>{events.push(`execute:${id}`);return{ok:false,error:"MANAGED_SESSION_BUSY"};};
  const decision=await runLiveBusInvocation(baseInput(ports)); assert.deepEqual(decision,{status:"UNKNOWN",stage:"WAKE_EXECUTION",reason:"WAKE_EXECUTION_AMBIGUOUS"}); assert.deepEqual(events,["persist","load-existing-wake","enqueue",`execute:${wakeId}`]);
});

test("forged executor identity fails closed", async () => {
  const events:string[]=[]; const ports=exactPorts(events); ports.executeManagedWake=async(id)=>{events.push(`execute:${id}`);return{ok:true,trace_authentication:{device_model:"OTHER",executed_function:"kira-managed-wake-executor-v1",message_id:wakeId,receiver_execution_id:"exec-1",agent_id:"agent-1",environment_id:"env-1",reply_message_id:replyId,deployment_run_id:"run-1",session_id:"session-1"}};};
  const decision=await runLiveBusInvocation(baseInput(ports)); assert.deepEqual(decision,{status:"HOLD",stage:"WAKE_EXECUTION",reason:"INVALID_WAKE_EVIDENCE"});
});

test("forged side-effect permit blocks MANAGED_WAKE executor call", async()=>{
  const events:string[]=[]; const input=baseInput(exactPorts(events)); const forged={...input.wakeExecutionFence.permit};
  const decision=await runLiveBusInvocation({...input,wakeExecutionFence:{...input.wakeExecutionFence,permit:forged}});
  assert.deepEqual(decision,{status:"HOLD",stage:"SIDE_EFFECT_FENCE",reason:"WAKE_EXECUTION_PERMIT_INVALID"});
  assert.deepEqual(events,["persist","load-existing-wake","enqueue"]);
});

test("wrong side-effect target blocks MANAGED_WAKE executor call", async()=>{
  const events:string[]=[]; const input=baseInput(exactPorts(events));
  const decision=await runLiveBusInvocation({...input,wakeExecutionFence:{...input.wakeExecutionFence,intent:{...input.wakeExecutionFence.intent,target:"managed-wake:OTHER"}}});
  assert.deepEqual(decision,{status:"HOLD",stage:"SIDE_EFFECT_FENCE",reason:"WAKE_EXECUTION_PERMIT_INVALID"});
  assert.deepEqual(events,["persist","load-existing-wake","enqueue"]);
});
