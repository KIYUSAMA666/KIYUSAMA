// Keeper proof gate: a queued job or notification is never a BODY wake.
// Pure isolated evaluator. No network, credential, browser or SEND effects.
const valid = x => typeof x === "string" && x.trim().length > 0;
export function evaluateKeeperWake({ event, observation }) {
  if (!event || ![event.eventId,event.targetActor,event.conversationId,event.causalTurnId].every(valid))
    return Object.freeze({status:"HOLD",reason:"COORDINATES_MISSING"});
  if (!observation || observation.eventId !== event.eventId || observation.actor !== event.targetActor || observation.conversationId !== event.conversationId)
    return Object.freeze({status:"HOLD",reason:"IDENTITY_UNPROVEN"});
  if (observation.authenticated !== true || observation.sameExistingBody !== true)
    return Object.freeze({status:"HOLD",reason:"BODY_UNPROVEN"});
  if (observation.acceptedCausalTurnId !== event.causalTurnId || !valid(observation.actualAssistantTurnId))
    return Object.freeze({status:"HOLD",reason:"WAKE_UNPROVEN"});
  if (observation.replyReadback !== true || observation.streamEnded !== true)
    return Object.freeze({status:"HOLD",reason:"RETURN_UNPROVEN"});
  return Object.freeze({status:"WAKE_VERIFIED",eventId:event.eventId,actor:event.targetActor,conversationId:event.conversationId,assistantTurnId:observation.actualAssistantTurnId});
}
