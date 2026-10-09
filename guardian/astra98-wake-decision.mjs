// Astra 9.8: pure wake-decision gate. No browser, network, database or SEND effects.
// Deliberately does not claim to wake an existing ChatGPT/Claude.ai conversation.
export function decideWake({ticket,worker,nowMs}) {
  if (!ticket || !worker || !Number.isSafeInteger(nowMs) || nowMs < 0) return {action:"HOLD",reason:"INVALID_INPUT"};
  if (!ticket.operationKey || !ticket.target || !ticket.workId) return {action:"HOLD",reason:"INCOMPLETE_TICKET"};
  if (ticket.status==="DONE") return {action:"SKIP",reason:"ALREADY_DONE"};
  if (ticket.status==="UNKNOWN_HOLD" || ticket.externalEffectAttempted===true) return {action:"HOLD",reason:"AMBIGUOUS_EXTERNAL_EFFECT"};
  if (ticket.status!=="READY") return {action:"HOLD",reason:"NOT_READY"};
  if (ticket.requiresHumanApproval===true) return {action:"HOLD",reason:"HUMAN_APPROVAL_REQUIRED"};
  if (worker.target!==ticket.target || worker.available!==true) return {action:"HOLD",reason:"NO_MATCHING_WORKER"};
  if (worker.canResumeOriginalConversation!==true && ticket.requiresOriginalConversation===true)
    return {action:"HOLD",reason:"ORIGINAL_CONVERSATION_UNPROVEN"};
  if (ticket.notBeforeMs!=null && (!Number.isSafeInteger(ticket.notBeforeMs) || nowMs<ticket.notBeforeMs))
    return {action:"HOLD",reason:"NOT_DUE"};
  return {action:"ELIGIBLE",operationKey:ticket.operationKey,workerId:worker.id};
}
// ELIGIBLE is only a decision. A real dispatcher MUST obtain durable, fenced,
// single-owner reservation before invoking any effectful adapter.
