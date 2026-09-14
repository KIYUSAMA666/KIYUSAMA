// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  createSlackOutboundText,
  slackSendResultToEvidence,
} from "../src/ai-communication-bus-slack-adapter.js";
import { issueVerifiedExecutionHandoffReceipt } from "../src/execution-handoff.js";
import { issueSideEffectPermit } from "../src/side-effect-fence.js";

const message = {
  messageId: "bus-slack-1",
  traceId: "trace-slack-1",
  kind: "MESSAGE" as const,
  sourceAgentId: "SORA",
  targetAgentId: "KIRA",
  parentMessageId: null,
  current: { stateId: "CURRENT", stateRevision: 1 },
  createdAt: "2026-09-13T05:40:00.000Z",
  payload: { type: "BUS_LIVE_PROBE", value: "PING" },
};
const expectedChannelId = "C0BU98EN7J9";
const sendResult = {
  channelId: expectedChannelId,
  messageTs: "1789278000.123456",
  messageLink: "https://example.slack.com/archives/C0BU98EN7J9/p1789278000123456",
};
const ref=(id="REF-SLACK",expectedVersion="1",path="evidence/REF-SLACK")=>({id,expectedVersion,path});
function snapshot(revision=1){return{identity:{stateId:"CURRENT",schemaVersion:"0.1",stateRevision:revision,effectiveAt:"2026-09-13T05:40:00Z",scope:"KIYUSAMA_OS_2",lineageId:"LINEAGE-MAIN-001"},humanDecisionFinal:{decisionId:"HD-SLACK",sourceAuthority:"KIYUSAMA",shortDirective:"admit slack evidence"},mainLineTask:{taskId:"ML-SLACK",description:"admit slack evidence"},nextActionSingle:{actionId:"NA-SLACK",description:"admit slack send result"},activeRolesAndAuthority:{EXECUTION_AUTHORITY:"EXECUTOR-1"},activeGuards:[],confirmedRefIndex:[{...ref(),status:"VERIFIED"}],independentLaneHealth:{status:"VERIFIED",evidenceVerdict:"SUFFICIENT",observedAt:"2026-09-13T05:40:00Z",evidenceSource:"KIRA-1"}}}
function admissionFence(overrides={}) {
  const s=snapshot();
  const handoffInput={snapshot:s,actionEvidenceRequirement:{actionId:"NA-SLACK",requiredRefs:[ref()],requireIndependentLane:false},capabilitySlot:{slotId:"S-SLACK",capabilityId:"CAP-SLACK",status:"BOUND",binding:{capabilityId:"CAP-SLACK",implementationId:"IMPL-SLACK",source:"NATIVE",version:"1",verified:true}},gateDecision:{status:"ALLOW",actionId:"NA-SLACK",stateId:"CURRENT",stateRevision:1,role:"EXECUTION_AUTHORITY",actorAuthorityId:"EXECUTOR-1"}};
  const handoffRequest={handoffId:"HO-SLACK",traceId:"TRACE-SLACK",actionId:"NA-SLACK",sourceStateId:"CURRENT",sourceStateRevision:1,requiredRole:"EXECUTION_AUTHORITY",executorAuthorityId:"EXECUTOR-1",capabilityId:"CAP-SLACK",implementationId:"IMPL-SLACK",issuedAt:"2026-09-13T05:39:00Z",expiresAt:"2026-09-13T06:10:00Z",evidenceRefs:[ref()],resultEvidencePolicy:{requiredRefs:[ref("REF-SLACK-RESULT","1","evidence/REF-SLACK-RESULT")],verifierId:"KIRA-1",evidenceSource:"KIRA-1"}};
  const handoff=issueVerifiedExecutionHandoffReceipt(handoffInput,handoffRequest,"2026-09-13T05:40:00Z"); assert.equal(handoff.status,"READY"); if(handoff.status!=="READY")assert.fail();
  const intent={permitId:"PERMIT-SLACK",handoffId:"HO-SLACK",actionId:"NA-SLACK",sourceStateId:"CURRENT",sourceStateRevision:1,capabilityId:"CAP-SLACK",workerId:"WORKER-3",workerEpoch:12,generation:43,effectClass:"EXTERNAL_MESSAGE",target:`slack-evidence:${message.messageId}:${expectedChannelId}`,operation:"admitSlackSendResult",issuedAt:"2026-09-13T05:40:01Z",expiresAt:"2026-09-13T05:45:01Z",...overrides};
  const decision=issueSideEffectPermit({handoffRequest,handoffReceipt:handoff.receipt,currentStateProvider:{readCurrentState:()=>s},expectedWorker:{workerId:"WORKER-3",workerEpoch:12,generation:43},intent,now:"2026-09-13T05:40:02Z"}); assert.equal(decision.status,"PERMIT"); if(decision.status!=="PERMIT")assert.fail();
  return{permit:decision.permit,intent,dispatchNow:"2026-09-13T05:40:03Z"};
}
function evidenceInput(overrides={}){return{message,expectedChannelId,sendResult,observedAt:"2026-09-13T05:40:01.000Z",admissionFence:admissionFence(),...overrides};}

test("slack outbound text preserves bus identity and payload", () => {
  const parsed = JSON.parse(createSlackOutboundText(message));
  assert.equal(parsed.messageId, message.messageId);
  assert.equal(parsed.traceId, message.traceId);
  assert.equal(parsed.targetAgentId, message.targetAgentId);
  assert.deepEqual(parsed.payload, message.payload);
});

test("valid permitted Slack send result becomes DELIVERED transport evidence", () => {
  const result = slackSendResultToEvidence(evidenceInput());
  assert.equal(result.status, "EVIDENCE");
  if (result.status === "EVIDENCE") {
    assert.equal(result.evidence.provider, "SLACK");
    assert.equal(result.evidence.providerDeliveryId, "1789278000.123456");
    assert.equal(result.evidence.status, "DELIVERED");
  }
});

test("forged admission permit blocks Slack evidence",()=>{const input=evidenceInput();const result=slackSendResultToEvidence({...input,admissionFence:{...input.admissionFence,permit:{...input.admissionFence.permit}}});assert.deepEqual(result,{status:"HOLD",reason:"SLACK_EVIDENCE_PERMIT_INVALID"});});
test("wrong admission target blocks Slack evidence",()=>{const input=evidenceInput();const result=slackSendResultToEvidence({...input,admissionFence:{...input.admissionFence,intent:{...input.admissionFence.intent,target:"slack-evidence:OTHER"}}});assert.deepEqual(result,{status:"HOLD",reason:"SLACK_EVIDENCE_PERMIT_INVALID"});});
test("wrong admission operation blocks Slack evidence",()=>{const input=evidenceInput();const result=slackSendResultToEvidence({...input,admissionFence:{...input.admissionFence,intent:{...input.admissionFence.intent,operation:"other"}}});assert.deepEqual(result,{status:"HOLD",reason:"SLACK_EVIDENCE_PERMIT_INVALID"});});
test("wrong effect class blocks Slack evidence",()=>{const input=evidenceInput();const result=slackSendResultToEvidence({...input,admissionFence:{...input.admissionFence,intent:{...input.admissionFence.intent,effectClass:"EXTERNAL_MUTATION"}}});assert.deepEqual(result,{status:"HOLD",reason:"SLACK_EVIDENCE_PERMIT_INVALID"});});
test("expired admission permit blocks Slack evidence",()=>{const input=evidenceInput();const result=slackSendResultToEvidence({...input,admissionFence:{...input.admissionFence,dispatchNow:"2026-09-13T05:46:00Z"}});assert.deepEqual(result,{status:"HOLD",reason:"SLACK_EVIDENCE_PERMIT_INVALID"});});
test("message CURRENT substitution blocks Slack evidence",()=>{const input=evidenceInput();const result=slackSendResultToEvidence({...input,message:{...message,current:{...message.current,stateRevision:2}}});assert.deepEqual(result,{status:"HOLD",reason:"SLACK_EVIDENCE_PERMIT_INVALID"});});
test("channel substitution blocks Slack evidence permit binding",()=>{const input=evidenceInput();const result=slackSendResultToEvidence({...input,expectedChannelId:"C-OTHER"});assert.deepEqual(result,{status:"HOLD",reason:"SLACK_EVIDENCE_PERMIT_INVALID"});});

test("missing Slack result is UNKNOWN, never DELIVERED", () => {
  assert.deepEqual(slackSendResultToEvidence(evidenceInput({sendResult:null})),{ status: "UNKNOWN", reason: "SLACK_SEND_RESULT_AMBIGUOUS" });
});
test("wrong Slack channel is HOLD", () => {const input=evidenceInput();const result=slackSendResultToEvidence({...input,sendResult:{...sendResult,channelId:"C-OTHER"}});assert.deepEqual(result,{status:"HOLD",reason:"SLACK_CHANNEL_MISMATCH"});});
test("missing messageTs is HOLD", () => {const result=slackSendResultToEvidence(evidenceInput({sendResult:{channelId:expectedChannelId,messageLink:sendResult.messageLink}}));assert.deepEqual(result,{status:"HOLD",reason:"INVALID_SLACK_SEND_RESULT"});});
test("non-Slack link is HOLD", () => {const result=slackSendResultToEvidence(evidenceInput({sendResult:{...sendResult,messageLink:"https://example.com/not-slack"}}));assert.deepEqual(result,{status:"HOLD",reason:"INVALID_SLACK_SEND_RESULT"});});
test("malformed Slack ts is HOLD", () => {const result=slackSendResultToEvidence(evidenceInput({sendResult:{...sendResult,messageTs:"not-a-ts"}}));assert.deepEqual(result,{status:"HOLD",reason:"INVALID_SLACK_SEND_RESULT"});});
test("invalid observedAt is HOLD", () => {const result=slackSendResultToEvidence(evidenceInput({observedAt:"not-a-time"}));assert.deepEqual(result,{status:"HOLD",reason:"INVALID_SLACK_SEND_RESULT"});});
