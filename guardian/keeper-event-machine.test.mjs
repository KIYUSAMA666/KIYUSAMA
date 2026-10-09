import test from "node:test";import assert from "node:assert/strict";import {keeperTransition as step} from "./keeper-event-machine.mjs";
const s={eventId:"e1",actor:"SORA_03",conversationId:"canonical",revision:0,status:"DETECTED"};
const go=(state,type,extra={})=>step(state,{type,eventId:state.eventId,expectedRevision:state.revision,...extra});
test("queue cannot skip BODY proof",()=>{const c=go(s,"CLAIM");const w=go(c,"REQUEST_WAKE");assert.equal(go(w,"CONFIRM_BODY").reason,"BODY_PROOF_REQUIRED");assert.equal(go(w,"COMMIT_NEXT").reason,"TRANSITION_DENIED")});
test("only proven same BODY allows successor",()=>{let x=go(go(s,"CLAIM"),"REQUEST_WAKE");x=go(x,"CONFIRM_BODY",{proof:{status:"WAKE_VERIFIED",eventId:"e1",actor:"SORA_03",conversationId:"canonical"}});assert.equal(x.status,"BODY_CONFIRMED");x=go(x,"VERIFY_RESULT",{resultId:"r1",readback:true});assert.equal(x.status,"RESULT_VERIFIED");assert.equal(go(x,"COMMIT_NEXT",{successorEventId:"e2",authorized:true}).status,"NEXT_READY")});
test("wrong actor or conversation proof denied",()=>{const x=go(go(s,"CLAIM"),"REQUEST_WAKE");assert.equal(go(x,"CONFIRM_BODY",{proof:{status:"WAKE_VERIFIED",eventId:"e1",actor:"EXTERNAL_KIRA",conversationId:"canonical"}}).reason,"BODY_PROOF_REQUIRED")});
test("stale revision denied",()=>assert.equal(step(s,{type:"CLAIM",eventId:"e1",expectedRevision:1}).reason,"STALE_OR_WRONG_EVENT"));
test("ambiguous send parks permanently",()=>{const x=go(go(s,"CLAIM"),"REQUEST_WAKE");const u=go(x,"MARK_UNCERTAIN");assert.equal(u.status,"UNCERTAIN");assert.equal(go(u,"REQUEST_WAKE").reason,"TRANSITION_DENIED")});
test("pending wake never advances itself",()=>{const x=go(go(s,"CLAIM"),"PARK");assert.equal(x.status,"PENDING");assert.equal(go(x,"CONFIRM_BODY").reason,"TRANSITION_DENIED")});
