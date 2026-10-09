// Distinguish completed assistant turn from live executor. Pure, fail-closed.
const nonempty=x=>typeof x==="string"&&x.trim().length>0;
export function evaluateKeeperContinuation({wakeProof,executor,expected}){
 if(!expected||![expected.eventId,expected.actor,expected.conversationId,expected.executorId].every(nonempty))return {status:"HOLD",reason:"EXPECTED_COORDINATES_MISSING"};
 if(!wakeProof||wakeProof.status!=="WAKE_VERIFIED"||wakeProof.eventId!==expected.eventId||wakeProof.actor!==expected.actor||wakeProof.conversationId!==expected.conversationId)return {status:"HOLD",reason:"BODY_REPLY_UNPROVEN"};
 if(!executor||executor.executorId!==expected.executorId||executor.actor!==expected.actor||executor.conversationId!==expected.conversationId)return {status:"HOLD",reason:"EXECUTOR_IDENTITY_UNPROVEN"};
 if(executor.processAlive!==true||executor.sessionAuthenticated!==true||executor.existingBodyBound!==true)return {status:"HOLD",reason:"EXECUTOR_NOT_LIVE"};
 if(!Number.isSafeInteger(executor.observationSeq)||executor.observationSeq<=0||!Number.isSafeInteger(executor.lastReplySeq)||executor.lastReplySeq<=0||executor.observationSeq<executor.lastReplySeq)return {status:"HOLD",reason:"LIVENESS_OBSERVATION_STALE"};
 return {status:"CONTINUATION_ELIGIBLE",eventId:expected.eventId,actor:expected.actor,conversationId:expected.conversationId,executorId:expected.executorId,observationSeq:executor.observationSeq};
}
