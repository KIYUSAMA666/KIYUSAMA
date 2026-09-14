import assert from "node:assert/strict";
import test from "node:test";
import type { BusDeliveryRecord } from "../src/ai-communication-bus-core.js";
import {
  bindManagedWakeEnqueue,
  bindManagedWakeExecutorResult,
  type ManagedWakeEvidenceReadback,
  type ManagedWakeExecutorReceipt,
} from "../src/ai-communication-bus-live-kira-adapter.js";

const delivery: BusDeliveryRecord = {
  message: { messageId:"bus-live-kira-01", traceId:"trace-live-kira-01", kind:"MESSAGE", sourceAgentId:"SORA", targetAgentId:"KIRA", parentMessageId:null, current:{stateId:"room-v1",stateRevision:1}, createdAt:"2026-09-13T08:00:00Z", payload:{type:"LIVE_KIRA_E2E"}},
  status:"DELIVERED", deliveredToAgentId:"KIRA", acknowledgedByAgentId:null,
};
const wakeId="259c01c3-8c82-47ee-affc-6aa2b1254735";
const replyId="d2705df9-0e52-44e0-bfec-db2e2a87551d";
const auditId="42ec4cd1-c5e6-4c25-9a20-5d36d92b8843";
const enqueue={ok:true,message_id:wakeId,status:"NEW",trust_class:"AUTHENTICATED_INTERNAL",instruction_scope:"MANAGED_WAKE"};
function bound(){ const d=bindManagedWakeEnqueue(delivery,null,enqueue,"2026-09-13T08:00:01Z"); if(d.status==="HOLD") assert.fail(d.reason); return d.value; }

function receipt(overrides: Partial<ManagedWakeExecutorReceipt> = {}): ManagedWakeExecutorReceipt {
  return {
    ok:true,
    status:"KIRA_MANAGED_GATED_READ_REPLY_CONFIRMED",
    trace_audit_action_id:auditId,
    trace_authentication:{
      device_model:"KIRA-BC",
      executed_function:"kira-managed-wake-executor-v1",
      message_id:wakeId,
      receiver_execution_id:"exec-12345678",
      agent_id:"agent-1",
      environment_id:"env-1",
      reply_message_id:replyId,
      session_id:"session-1",
    },
    ...overrides,
  };
}

function readback(r: ManagedWakeExecutorReceipt = receipt()): ManagedWakeEvidenceReadback {
  const t=r.trace_authentication!;
  return {
    traceAudit:{
      action_id:r.trace_audit_action_id,
      event_type:"KIRA_BC_TRACE_AUTH",
      actor_id:"KIRA_MANAGED_WAKE_V1",
      target_type:"agent_message",
      target_id:wakeId,
      result:"SUCCESS",
      evidence:{
        device_model:t.device_model,
        executed_function:t.executed_function,
        message_id:t.message_id,
        receiver_execution_id:t.receiver_execution_id,
        agent_id:t.agent_id,
        environment_id:t.environment_id,
        reply_message_id:t.reply_message_id,
        session_id:t.session_id,
      },
    },
    replyStoredAudit:{
      event_type:"AI_EXECUTOR_REPLY_STORED",
      actor_id:"KIRA_EXECUTOR_V2C",
      target_type:"agent_message",
      target_id:t.reply_message_id,
      result:"SUCCESS",
      evidence:{
        parent_message_id:wakeId,
        execution_id:t.receiver_execution_id,
        trust_class:"AUTHENTICATED_INTERNAL",
        instruction_scope:"REVIEW_ONLY",
      },
    },
  };
}

test("binds exact authenticated MANAGED_WAKE enqueue UUID",()=>{ const d=bindManagedWakeEnqueue(delivery,null,enqueue,"2026-09-13T08:00:01Z"); if(d.status==="HOLD") assert.fail(d.reason); assert.equal(d.status,"ACCEPTED"); assert.equal(d.value.wakeMessageId,wakeId); });
test("rejects non-UUID enqueue",()=>{ const d=bindManagedWakeEnqueue(delivery,null,{...enqueue,message_id:"bus-live-kira-01"},"2026-09-13T08:00:01Z"); assert.deepEqual(d,{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"}); });
test("rejects non-authenticated wake lane",()=>{ const d=bindManagedWakeEnqueue(delivery,null,{...enqueue,trust_class:"PEER_DATA"},"2026-09-13T08:00:01Z"); assert.deepEqual(d,{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"}); });
test("rejects wrong instruction scope",()=>{ const d=bindManagedWakeEnqueue(delivery,null,{...enqueue,instruction_scope:"SAFE_COLLAB"},"2026-09-13T08:00:01Z"); assert.deepEqual(d,{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"}); });
test("rejects non-NEW enqueue",()=>{ const d=bindManagedWakeEnqueue(delivery,null,{...enqueue,status:"BLOCKED"},"2026-09-13T08:00:01Z"); assert.deepEqual(d,{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"}); });

test("session executor confirms only with exact durable trace and reply readback",()=>{
  const r=receipt(); const d=bindManagedWakeExecutorResult(bound(),r,readback(r),"2026-09-13T08:00:20Z");
  if(d.status==="HOLD") assert.fail(d.reason);
  assert.equal(d.status,"ACCEPTED");
  assert.equal(d.value.status,"CONFIRMED");
  assert.equal(d.value.sessionId,"session-1");
  assert.equal(d.value.receiverExecutionId,"exec-12345678");
  assert.equal(d.value.replyMessageId,replyId);
  assert.equal(d.value.traceAuditActionId,auditId);
});

test("missing durable audit readback remains UNKNOWN, never success",()=>{
  const d=bindManagedWakeExecutorResult(bound(),receipt(),null,"2026-09-13T08:00:20Z");
  if(d.status==="HOLD") assert.fail(d.reason);
  assert.equal(d.status,"UNKNOWN");
  assert.equal(d.value.status,"UNKNOWN");
});

test("forged wake message id is held",()=>{
  const r=receipt({trace_authentication:{...receipt().trace_authentication!,message_id:"d2705df9-0e52-44e0-bfec-db2e2a87551d"}});
  assert.deepEqual(bindManagedWakeExecutorResult(bound(),r,readback(r),"2026-09-13T08:00:20Z"),{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"});
});

test("forged executor identity is held",()=>{
  const r=receipt({trace_authentication:{...receipt().trace_authentication!,device_model:"OTHER"}});
  assert.deepEqual(bindManagedWakeExecutorResult(bound(),r,readback(r),"2026-09-13T08:00:20Z"),{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"});
});

test("wrong session in audit fails closed",()=>{
  const r=receipt(); const rb=readback(r); rb.traceAudit.evidence={...rb.traceAudit.evidence!,session_id:"session-forged"};
  assert.deepEqual(bindManagedWakeExecutorResult(bound(),r,rb,"2026-09-13T08:00:20Z"),{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"});
});

test("wrong receiver execution in trace audit fails closed",()=>{
  const r=receipt(); const rb=readback(r); rb.traceAudit.evidence={...rb.traceAudit.evidence!,receiver_execution_id:"exec-forged"};
  assert.deepEqual(bindManagedWakeExecutorResult(bound(),r,rb,"2026-09-13T08:00:20Z"),{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"});
});

test("forged reply UUID in trace receipt fails against durable reply audit",()=>{
  const r=receipt({trace_authentication:{...receipt().trace_authentication!,reply_message_id:"ddb89350-fc13-40da-8862-9a1e1aca801d"}});
  const rb=readback();
  assert.deepEqual(bindManagedWakeExecutorResult(bound(),r,rb,"2026-09-13T08:00:20Z"),{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"});
});

test("wrong trace audit action id fails closed",()=>{
  const r=receipt(); const rb=readback(r); rb.traceAudit.action_id="ddb89350-fc13-40da-8862-9a1e1aca801d";
  assert.deepEqual(bindManagedWakeExecutorResult(bound(),r,rb,"2026-09-13T08:00:20Z"),{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"});
});

test("wrong audit target wake fails closed",()=>{
  const r=receipt(); const rb=readback(r); rb.traceAudit.target_id="ddb89350-fc13-40da-8862-9a1e1aca801d";
  assert.deepEqual(bindManagedWakeExecutorResult(bound(),r,rb,"2026-09-13T08:00:20Z"),{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"});
});

test("reply audit with wrong parent wake fails closed",()=>{
  const r=receipt(); const rb=readback(r); rb.replyStoredAudit.evidence={...rb.replyStoredAudit.evidence!,parent_message_id:"ddb89350-fc13-40da-8862-9a1e1aca801d"};
  assert.deepEqual(bindManagedWakeExecutorResult(bound(),r,rb,"2026-09-13T08:00:20Z"),{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"});
});

test("reply audit with wrong execution id fails closed",()=>{
  const r=receipt(); const rb=readback(r); rb.replyStoredAudit.evidence={...rb.replyStoredAudit.evidence!,execution_id:"exec-forged"};
  assert.deepEqual(bindManagedWakeExecutorResult(bound(),r,rb,"2026-09-13T08:00:20Z"),{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"});
});

test("busy provider becomes UNKNOWN not success",()=>{ const d=bindManagedWakeExecutorResult(bound(),{ok:false,error:"MANAGED_SESSION_BUSY"},null,"2026-09-13T08:00:20Z"); assert.equal(d.status,"UNKNOWN"); });
test("explicit policy rejection terminalizes",()=>{ const d=bindManagedWakeExecutorResult(bound(),{ok:false,error:"MANAGED_WAKE_POLICY_REJECTED"},null,"2026-09-13T08:00:20Z"); if(d.status==="HOLD") assert.fail(d.reason); assert.equal(d.status,"ACCEPTED"); assert.equal(d.value.status,"TERMINAL_FAILED"); });
