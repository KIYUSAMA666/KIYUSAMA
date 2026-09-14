import {
  createBusReply,
  type BusCurrentBinding,
  type BusDeliveryRecord,
  type BusMessage,
} from "./ai-communication-bus-core.js";

export type KiraWakeStatus = "PENDING" | "UNKNOWN" | "CONFIRMED" | "TERMINAL_FAILED";

export interface KiraWakeBridgeRecord {
  messageId: string;
  traceId: string;
  targetAgentId: "KIRA";
  current: BusCurrentBinding;
  status: KiraWakeStatus;
  wakeMessageId: string | null;
  /** Legacy Deployment Run evidence. Session-based production keeps this null. */
  deploymentRunId: string | null;
  sessionId: string | null;
  receiverExecutionId: string | null;
  replyMessageId: string | null;
  traceAuditActionId: string | null;
  observedAt: string | null;
}

export interface KiraWakeDispatchEvidence {
  messageId: string;
  traceId: string;
  targetAgentId: "KIRA";
  wakeMessageId: string;
  observedAt: string;
}

export type KiraWakeResult =
  | {
      outcome: "CONSUMED";
      messageId: string;
      traceId: string;
      targetAgentId: "KIRA";
      wakeMessageId: string;
      sessionId: string;
      receiverExecutionId: string;
      replyMessageId: string;
      traceAuditActionId: string;
      observedAt: string;
      authorityGranted?: boolean;
    }
  | {
      outcome: "AMBIGUOUS";
      messageId: string;
      traceId: string;
      targetAgentId: "KIRA";
      wakeMessageId?: string | null;
      observedAt: string;
      authorityGranted?: boolean;
    }
  | {
      outcome: "REJECTED";
      messageId: string;
      traceId: string;
      targetAgentId: "KIRA";
      wakeMessageId?: string | null;
      observedAt: string;
      authorityGranted?: boolean;
    };

export type KiraWakeHoldReason =
  | "INVALID_BUS_STATE"
  | "INVALID_TARGET"
  | "WAKE_BINDING_MISMATCH"
  | "INVALID_WAKE_EVIDENCE"
  | "INVALID_WAKE_TRANSITION"
  | "AUTHORITY_ESCALATION_FORBIDDEN"
  | "WAKE_CONFLICT"
  | "REPLY_NOT_CONFIRMED";

export type KiraWakeDecision<T> =
  | { status: "ACCEPTED"; value: T }
  | { status: "IDEMPOTENT"; value: T }
  | { status: "UNKNOWN"; value: T }
  | { status: "HOLD"; reason: KiraWakeHoldReason };

function validNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function validTimestamp(value: unknown): value is string { return validNonEmpty(value) && Number.isFinite(Date.parse(value)); }
function validUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function sameBusBinding(record: KiraWakeBridgeRecord,value: { messageId: string; traceId: string; targetAgentId: "KIRA" }): boolean { return value.messageId===record.messageId&&value.traceId===record.traceId&&value.targetAgentId===record.targetAgentId; }

export function prepareKiraWake(existing: KiraWakeBridgeRecord | null,delivery: BusDeliveryRecord): KiraWakeDecision<KiraWakeBridgeRecord> {
  if (delivery.status !== "DELIVERED" && delivery.status !== "ACKNOWLEDGED") return { status: "HOLD", reason: "INVALID_BUS_STATE" };
  if (delivery.message.targetAgentId !== "KIRA" || delivery.deliveredToAgentId !== "KIRA") return { status: "HOLD", reason: "INVALID_TARGET" };
  const next: KiraWakeBridgeRecord = {messageId:delivery.message.messageId,traceId:delivery.message.traceId,targetAgentId:"KIRA",current:structuredClone(delivery.message.current),status:"PENDING",wakeMessageId:null,deploymentRunId:null,sessionId:null,receiverExecutionId:null,replyMessageId:null,traceAuditActionId:null,observedAt:null};
  if (existing === null) return { status: "ACCEPTED", value: next };
  if (existing.messageId===next.messageId&&existing.traceId===next.traceId&&existing.targetAgentId===next.targetAgentId&&existing.current.stateId===next.current.stateId&&existing.current.stateRevision===next.current.stateRevision) return { status:"IDEMPOTENT", value:structuredClone(existing) };
  return { status:"HOLD", reason:"WAKE_CONFLICT" };
}

export function attachKiraWakeDispatchEvidence(record: KiraWakeBridgeRecord,evidence: KiraWakeDispatchEvidence): KiraWakeDecision<KiraWakeBridgeRecord> {
  if (!sameBusBinding(record,evidence)) return {status:"HOLD",reason:"WAKE_BINDING_MISMATCH"};
  if (!validUuid(evidence.wakeMessageId)||!validTimestamp(evidence.observedAt)) return {status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"};
  if (record.status==="CONFIRMED"||record.status==="TERMINAL_FAILED") return {status:"HOLD",reason:"INVALID_WAKE_TRANSITION"};
  if (record.wakeMessageId!==null) return record.wakeMessageId===evidence.wakeMessageId?{status:"IDEMPOTENT",value:structuredClone(record)}:{status:"HOLD",reason:"WAKE_CONFLICT"};
  return {status:"ACCEPTED",value:{...structuredClone(record),wakeMessageId:evidence.wakeMessageId,observedAt:evidence.observedAt}};
}

export function applyKiraWakeResult(record: KiraWakeBridgeRecord,result: KiraWakeResult): KiraWakeDecision<KiraWakeBridgeRecord> {
  if (!sameBusBinding(record,result)) return {status:"HOLD",reason:"WAKE_BINDING_MISMATCH"};
  if (!validTimestamp(result.observedAt)) return {status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"};
  if (result.authorityGranted===true) return {status:"HOLD",reason:"AUTHORITY_ESCALATION_FORBIDDEN"};
  if (result.wakeMessageId!=null&&(!validUuid(result.wakeMessageId)||(record.wakeMessageId!==null&&result.wakeMessageId!==record.wakeMessageId))) return {status:"HOLD",reason:"WAKE_BINDING_MISMATCH"};
  if (record.status==="CONFIRMED") {
    if (result.outcome==="CONSUMED"&&result.wakeMessageId===record.wakeMessageId&&result.sessionId===record.sessionId&&result.receiverExecutionId===record.receiverExecutionId&&result.replyMessageId===record.replyMessageId&&result.traceAuditActionId===record.traceAuditActionId) return {status:"IDEMPOTENT",value:structuredClone(record)};
    return {status:"HOLD",reason:"INVALID_WAKE_TRANSITION"};
  }
  if (record.status==="TERMINAL_FAILED") return result.outcome==="REJECTED"?{status:"IDEMPOTENT",value:structuredClone(record)}:{status:"HOLD",reason:"INVALID_WAKE_TRANSITION"};
  if (result.outcome==="AMBIGUOUS") return {status:"UNKNOWN",value:{...structuredClone(record),status:"UNKNOWN",observedAt:result.observedAt}};
  if (result.outcome==="REJECTED") return {status:"ACCEPTED",value:{...structuredClone(record),status:"TERMINAL_FAILED",observedAt:result.observedAt}};
  if (record.wakeMessageId===null||result.wakeMessageId!==record.wakeMessageId||!validNonEmpty(result.sessionId)||!validNonEmpty(result.receiverExecutionId)||!validUuid(result.replyMessageId)||!validUuid(result.traceAuditActionId)) return {status:"HOLD",reason:"INVALID_WAKE_EVIDENCE"};
  return {status:"ACCEPTED",value:{...structuredClone(record),status:"CONFIRMED",deploymentRunId:null,sessionId:result.sessionId,receiverExecutionId:result.receiverExecutionId,replyMessageId:result.replyMessageId,traceAuditActionId:result.traceAuditActionId,observedAt:result.observedAt}};
}

export function createKiraWakeReply(parent: BusMessage,wake: KiraWakeBridgeRecord,reply: BusMessage): KiraWakeDecision<BusMessage> {
  if (wake.status!=="CONFIRMED"||wake.wakeMessageId===null||wake.messageId!==parent.messageId||wake.traceId!==parent.traceId||wake.current.stateId!==parent.current.stateId||wake.current.stateRevision!==parent.current.stateRevision) return {status:"HOLD",reason:"REPLY_NOT_CONFIRMED"};
  const decision=createBusReply(parent,reply);
  if (decision.status==="HOLD") return {status:"HOLD",reason:"WAKE_BINDING_MISMATCH"};
  return {status:"ACCEPTED",value:decision.value};
}
