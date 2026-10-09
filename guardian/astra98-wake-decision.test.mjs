import test from "node:test";
import assert from "node:assert/strict";
import {decideWake} from "./astra98-wake-decision.mjs";
const ticket={operationKey:"op-1",target:"K",workId:"work-1",status:"READY",requiresOriginalConversation:true};
const worker={id:"codex-k",target:"K",available:true,canResumeOriginalConversation:true};
const run=(t={},w={},nowMs=1000)=>decideWake({ticket:{...ticket,...t},worker:{...worker,...w},nowMs});
test("eligible only for a verified matching worker",()=>assert.deepEqual(run(),{action:"ELIGIBLE",operationKey:"op-1",workerId:"codex-k"}));
for(const [name,t,w,reason] of [
 ["done",{status:"DONE"},{},"ALREADY_DONE"],
 ["unknown",{status:"UNKNOWN_HOLD"},{},"AMBIGUOUS_EXTERNAL_EFFECT"],
 ["attempted",{externalEffectAttempted:true},{},"AMBIGUOUS_EXTERNAL_EFFECT"],
 ["not ready",{status:"PENDING"},{},"NOT_READY"],
 ["approval",{requiresHumanApproval:true},{},"HUMAN_APPROVAL_REQUIRED"],
 ["wrong worker",{}, {target:"S"},"NO_MATCHING_WORKER"],
 ["offline",{}, {available:false},"NO_MATCHING_WORKER"],
 ["original unproven",{}, {canResumeOriginalConversation:false},"ORIGINAL_CONVERSATION_UNPROVEN"],
 ["not due",{notBeforeMs:2000},{},"NOT_DUE"],
 ["missing operation",{operationKey:""},{},"INCOMPLETE_TICKET"]
]) test(name,()=>assert.equal(run(t,w).reason,reason));
test("independent work may run without original-chat capability",()=>assert.equal(run({requiresOriginalConversation:false},{canResumeOriginalConversation:false}).action,"ELIGIBLE"));
test("invalid clock fails closed",()=>assert.equal(run({}, {}, -1).action,"HOLD"));
