// Pure Keeper state machine. No SEND, network, browser or credentials.
const str=x=>typeof x==="string"&&x.trim().length>0;
export function keeperTransition(state,action){
 if(!state||!str(state.eventId)||!str(state.actor)||!str(state.conversationId)||!Number.isSafeInteger(state.revision)||state.revision<0) return {status:"HOLD",reason:"INVALID_STATE"};
 if(!action||action.eventId!==state.eventId||action.expectedRevision!==state.revision) return {status:"HOLD",reason:"STALE_OR_WRONG_EVENT"};
 const next={CLAIM:{DETECTED:"CLAIMED"},REQUEST_WAKE:{CLAIMED:"WAKE_REQUESTED"},CONFIRM_BODY:{WAKE_REQUESTED:"BODY_CONFIRMED"},VERIFY_RESULT:{BODY_CONFIRMED:"RESULT_VERIFIED"},COMMIT_NEXT:{RESULT_VERIFIED:"NEXT_READY"}}[action.type]?.[state.status];
 if(action.type==="PARK"&&["CLAIMED","WAKE_REQUESTED"].includes(state.status)) return {...state,status:"PENDING",revision:state.revision+1};
 if(action.type==="MARK_UNCERTAIN"&&["WAKE_REQUESTED","BODY_CONFIRMED"].includes(state.status)) return {...state,status:"UNCERTAIN",revision:state.revision+1};
 if(!next) return {status:"HOLD",reason:"TRANSITION_DENIED"};
 if(action.type==="CONFIRM_BODY"&&(!action.proof||action.proof.status!=="WAKE_VERIFIED"||action.proof.eventId!==state.eventId||action.proof.actor!==state.actor||action.proof.conversationId!==state.conversationId)) return {status:"HOLD",reason:"BODY_PROOF_REQUIRED"};
 if(action.type==="VERIFY_RESULT"&&(!str(action.resultId)||action.readback!==true)) return {status:"HOLD",reason:"RESULT_READBACK_REQUIRED"};
 if(action.type==="COMMIT_NEXT"&&(!str(action.successorEventId)||action.successorEventId===state.eventId||action.authorized!==true)) return {status:"HOLD",reason:"SUCCESSOR_AUTHORITY_REQUIRED"};
 return {...state,status:next,revision:state.revision+1,...(action.type==="VERIFY_RESULT"?{resultId:action.resultId}:{}),...(action.type==="COMMIT_NEXT"?{successorEventId:action.successorEventId}:{})};
}
