import type { BusDeliveryRecord } from "./ai-communication-bus-core.js";
import {
  applyKiraWakeResult,
  attachKiraWakeDispatchEvidence,
  prepareKiraWake,
  type KiraWakeBridgeRecord,
  type KiraWakeDecision,
} from "./ai-communication-bus-kira-wake-bridge.js";

export interface ManagedWakeEnqueueReceipt {
  ok: boolean;
  message_id?: string;
  thread_id?: string;
  status?: string;
  trust_class?: string;
  instruction_scope?: string;
  error?: string;
}

export interface ManagedWakeExecutorReceipt {
  ok: boolean;
  status?: string;
  error?: string;
  trace_audit_action_id?: string;
  trace_authentication?: {
    device_model?: string;
    executed_function?: string;
    message_id?: string;
    receiver_execution_id?: string;
    agent_id?: string;
    environment_id?: string;
    reply_message_id?: string;
    deployment_run_id?: string;
    session_id?: string;
  };
}

export interface ManagedWakeAuditRow {
  action_id?: string;
  event_type?: string;
  actor_id?: string;
  target_type?: string;
  target_id?: string;
  result?: string;
  evidence?: Record<string, unknown> | null;
}

export interface ManagedWakeEvidenceReadback {
  traceAudit: ManagedWakeAuditRow;
  replyStoredAudit: ManagedWakeAuditRow;
}

export type LiveKiraAdapterDecision = KiraWakeDecision<KiraWakeBridgeRecord>;

function nonEmpty(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
function uuid(v: unknown): v is string { return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }

function exactTraceAudit(record: KiraWakeBridgeRecord,receipt: ManagedWakeExecutorReceipt,readback: ManagedWakeEvidenceReadback): boolean {
  const trace=receipt.trace_authentication,audit=readback.traceAudit,evidence=audit.evidence;
  if(!trace||!evidence||typeof evidence!=="object") return false;
  return uuid(receipt.trace_audit_action_id)&&audit.action_id===receipt.trace_audit_action_id&&audit.event_type==="KIRA_BC_TRACE_AUTH"&&audit.actor_id==="KIRA_MANAGED_WAKE_V1"&&audit.target_type==="agent_message"&&audit.target_id===record.wakeMessageId&&audit.result==="SUCCESS"&&evidence.device_model===trace.device_model&&evidence.executed_function===trace.executed_function&&evidence.message_id===trace.message_id&&evidence.receiver_execution_id===trace.receiver_execution_id&&evidence.agent_id===trace.agent_id&&evidence.environment_id===trace.environment_id&&evidence.reply_message_id===trace.reply_message_id&&evidence.session_id===trace.session_id;
}

function exactReplyStoredAudit(record: KiraWakeBridgeRecord,receipt: ManagedWakeExecutorReceipt,readback: ManagedWakeEvidenceReadback): boolean {
  const trace=receipt.trace_authentication,audit=readback.replyStoredAudit,evidence=audit.evidence;
  if(!trace||!evidence||typeof evidence!=="object") return false;
  return audit.event_type==="AI_EXECUTOR_REPLY_STORED"&&audit.actor_id==="KIRA_EXECUTOR_V2C"&&audit.target_type==="agent_message"&&audit.target_id===trace.reply_message_id&&audit.result==="SUCCESS"&&evidence.parent_message_id===record.wakeMessageId&&evidence.execution_id===trace.receiver_execution_id&&evidence.trust_class==="AUTHENTICATED_INTERNAL"&&evidence.instruction_scope==="REVIEW_ONLY";
}

export function bindManagedWakeEnqueue(delivery: BusDeliveryRecord,existing: KiraWakeBridgeRecord | null,receipt: ManagedWakeEnqueueReceipt,observedAt: string): LiveKiraAdapterDecision {
  const prepared=prepareKiraWake(existing,delivery);
  if(prepared.status==="HOLD") return prepared;
  if(!receipt.ok) return {status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"};
  if(!uuid(receipt.message_id)||receipt.trust_class!=="AUTHENTICATED_INTERNAL"||receipt.instruction_scope!=="MANAGED_WAKE"||receipt.status!=="NEW") return {status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"};
  return attachKiraWakeDispatchEvidence(prepared.value,{messageId:delivery.message.messageId,traceId:delivery.message.traceId,targetAgentId:"KIRA",wakeMessageId:receipt.message_id,observedAt});
}

export function bindManagedWakeExecutorResult(record: KiraWakeBridgeRecord,receipt: ManagedWakeExecutorReceipt,readback: ManagedWakeEvidenceReadback | null,observedAt: string): LiveKiraAdapterDecision {
  if(!receipt.ok){
    const ambiguous=receipt.error==="MANAGED_SESSION_BUSY"||receipt.error==="MANAGED_AGENT_NO_FRESH_REPLY"||receipt.error==="MANAGED_WAKE_FAILED";
    return applyKiraWakeResult(record,{outcome:ambiguous?"AMBIGUOUS":"REJECTED",messageId:record.messageId,traceId:record.traceId,targetAgentId:"KIRA",wakeMessageId:record.wakeMessageId,observedAt});
  }
  const trace=receipt.trace_authentication;
  if(!trace||trace.device_model!=="KIRA-BC"||trace.executed_function!=="kira-managed-wake-executor-v1"||trace.message_id!==record.wakeMessageId||!nonEmpty(trace.receiver_execution_id)||!nonEmpty(trace.agent_id)||!nonEmpty(trace.environment_id)||!uuid(trace.reply_message_id)||!nonEmpty(trace.session_id)) return {status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"};

  if(readback===null){
    if(nonEmpty(trace.deployment_run_id)){
      return {status:"ACCEPTED",value:{...structuredClone(record),status:"CONFIRMED",deploymentRunId:trace.deployment_run_id,sessionId:trace.session_id,receiverExecutionId:trace.receiver_execution_id,replyMessageId:trace.reply_message_id,traceAuditActionId:null,observedAt}};
    }
    return {status:"UNKNOWN",value:{...structuredClone(record),status:"UNKNOWN",observedAt}};
  }

  if(!uuid(receipt.trace_audit_action_id)||!exactTraceAudit(record,receipt,readback)||!exactReplyStoredAudit(record,receipt,readback)) return {status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"};

  return applyKiraWakeResult(record,{outcome:"CONSUMED",messageId:record.messageId,traceId:record.traceId,targetAgentId:"KIRA",wakeMessageId:record.wakeMessageId!,sessionId:trace.session_id,receiverExecutionId:trace.receiver_execution_id,replyMessageId:trace.reply_message_id,traceAuditActionId:receipt.trace_audit_action_id,observedAt});
}
