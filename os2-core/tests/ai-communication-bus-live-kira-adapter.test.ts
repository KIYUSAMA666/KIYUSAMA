import assert from "node:assert/strict";
import test from "node:test";
import type { BusDeliveryRecord } from "../src/ai-communication-bus-core.js";
import { bindManagedWakeEnqueue, bindManagedWakeExecutorResult } from "../src/ai-communication-bus-live-kira-adapter.js";

const delivery: BusDeliveryRecord = {
  message: { messageId:"bus-live-kira-01", traceId:"trace-live-kira-01", sourceAgentId:"SORA", targetAgentId:"KIRA", current:{stateId:"room-v1",stateRevision:1}, createdAt:"2026-09-13T08:00:00Z", payload:{type:"LIVE_KIRA_E2E"}},
  status:"DELIVERED", deliveredToAgentId:"KIRA", acknowledgedByAgentId:null,
};
const wakeId="259c01c3-8c82-47ee-affc-6aa2b1254735";
const enqueue={ok:true,message_id:wakeId,status:"NEW",trust_class:"AUTHENTICATED_INTERNAL",instruction_scope:"MANAGED_WAKE"};
function bound(){ const d=bindManagedWakeEnqueue(delivery,null,enqueue,"2026-09-13T08:00:01Z"); assert.notEqual(d.status,"HOLD"); return d.value; }

test("binds exact authenticated MANAGED_WAKE enqueue UUID",()=>{ const d=bindManagedWakeEnqueue(delivery,null,enqueue,"2026-09-13T08:00:01Z"); assert.equal(d.status,"ACCEPTED"); assert.equal(d.value.wakeMessageId,wakeId); });
test("rejects non-UUID enqueue",()=>{ const d=bindManagedWakeEnqueue(delivery,null,{...enqueue,message_id:"bus-live-kira-01"},"2026-09-13T08:00:01Z"); assert.deepEqual(d,{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"}); });
test("rejects non-authenticated wake lane",()=>{ const d=bindManagedWakeEnqueue(delivery,null,{...enqueue,trust_class:"PEER_DATA"},"2026-09-13T08:00:01Z"); assert.deepEqual(d,{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"}); });
test("rejects wrong instruction scope",()=>{ const d=bindManagedWakeEnqueue(delivery,null,{...enqueue,instruction_scope:"SAFE_COLLAB"},"2026-09-13T08:00:01Z"); assert.deepEqual(d,{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"}); });
test("rejects non-NEW enqueue",()=>{ const d=bindManagedWakeEnqueue(delivery,null,{...enqueue,status:"BLOCKED"},"2026-09-13T08:00:01Z"); assert.deepEqual(d,{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"}); });
test("executor success without deployment run evidence remains UNKNOWN",()=>{ const d=bindManagedWakeExecutorResult(bound(),{ok:true,status:"KIRA_MANAGED_GATED_READ_REPLY_CONFIRMED",trace_authentication:{device_model:"KIRA-BC",executed_function:"kira-managed-wake-executor-v1",message_id:wakeId,receiver_execution_id:"exec-1",agent_id:"agent-1",environment_id:"env-1",reply_message_id:"d2705df9-0e52-44e0-bfec-db2e2a87551d",session_id:"session-1"}},"2026-09-13T08:00:20Z"); assert.equal(d.status,"UNKNOWN"); assert.equal(d.value.status,"UNKNOWN"); });
test("exact executor trace with deployment run confirms",()=>{ const d=bindManagedWakeExecutorResult(bound(),{ok:true,trace_authentication:{device_model:"KIRA-BC",executed_function:"kira-managed-wake-executor-v1",message_id:wakeId,receiver_execution_id:"exec-1",agent_id:"agent-1",environment_id:"env-1",reply_message_id:"d2705df9-0e52-44e0-bfec-db2e2a87551d",deployment_run_id:"run-1",session_id:"session-1"}},"2026-09-13T08:00:20Z"); assert.equal(d.status,"ACCEPTED"); assert.equal(d.value.status,"CONFIRMED"); });
test("forged wake message id is held",()=>{ const d=bindManagedWakeExecutorResult(bound(),{ok:true,trace_authentication:{device_model:"KIRA-BC",executed_function:"kira-managed-wake-executor-v1",message_id:"d2705df9-0e52-44e0-bfec-db2e2a87551d",receiver_execution_id:"exec",agent_id:"agent",environment_id:"env",reply_message_id:"d2705df9-0e52-44e0-bfec-db2e2a87551d",deployment_run_id:"run",session_id:"session"}},"2026-09-13T08:00:20Z"); assert.deepEqual(d,{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"}); });
test("forged executor identity is held",()=>{ const d=bindManagedWakeExecutorResult(bound(),{ok:true,trace_authentication:{device_model:"OTHER",executed_function:"kira-managed-wake-executor-v1",message_id:wakeId,receiver_execution_id:"exec",agent_id:"agent",environment_id:"env",reply_message_id:"d2705df9-0e52-44e0-bfec-db2e2a87551d",deployment_run_id:"run",session_id:"session"}},"2026-09-13T08:00:20Z"); assert.deepEqual(d,{status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"}); });
test("busy provider becomes UNKNOWN not success",()=>{ const d=bindManagedWakeExecutorResult(bound(),{ok:false,error:"MANAGED_SESSION_BUSY"},"2026-09-13T08:00:20Z"); assert.equal(d.status,"UNKNOWN"); });
test("explicit policy rejection terminalizes",()=>{ const d=bindManagedWakeExecutorResult(bound(),{ok:false,error:"MANAGED_WAKE_POLICY_REJECTED"},"2026-09-13T08:00:20Z"); assert.equal(d.status,"ACCEPTED"); assert.equal(d.value.status,"TERMINAL_FAILED"); });
