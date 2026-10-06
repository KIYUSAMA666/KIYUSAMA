import test from "node:test";
import assert from "node:assert/strict";
import { GuardianIdentityRegistry } from "./identity-registry.mjs";

const KIRA={agentId:"KIRA",provider:"claude.ai",conversationId:"b2ed0bb2-82f9-4d4e-8fe8-5626023086dc",canonicalUrl:"https://claude.ai/chat/b2ed0bb2-82f9-4d4e-8fe8-5626023086dc",bodyId:"claude:b2ed0bb2-82f9-4d4e-8fe8-5626023086dc"};
const work={agent_id:"KIRA",id:4416,latest_entry_id:1098};
test("registered identity plus explicit formal work coordinates resolves four Guardian coordinates",()=>{
 const r=new GuardianIdentityRegistry([KIRA]).resolve(work,{agentId:"KIRA",patrolRunId:4416,ownerId:"OPEN_ROOM",workId:"PATROL_RUN_4416",expectedUserTurnId:"FORMAL_USER_TURN_ABC"});
 assert.equal(r.expected.bodyId,KIRA.bodyId); assert.equal(r.expected.expectedUserTurnId,"FORMAL_USER_TURN_ABC");
});
for(const [name,c] of [
 ["expectedUserTurnId",{agentId:"KIRA",patrolRunId:4416,ownerId:"OPEN_ROOM",workId:"PATROL_RUN_4416"}],
 ["ownerId",{agentId:"KIRA",patrolRunId:4416,workId:"PATROL_RUN_4416",expectedUserTurnId:"X"}],
 ["workId",{agentId:"KIRA",patrolRunId:4416,ownerId:"OPEN_ROOM",expectedUserTurnId:"X"}],
]) test("missing "+name+" is UNRESOLVED",()=>{
 assert.throws(()=>new GuardianIdentityRegistry([KIRA]).resolve(work,c),/IDENTITY_REGISTRY_UNRESOLVED/);
});
test("latest_entry_id is never substituted for expectedUserTurnId",()=>{
 assert.throws(()=>new GuardianIdentityRegistry([KIRA]).resolve(work,{agentId:"KIRA",patrolRunId:4416,ownerId:"OPEN_ROOM",workId:"PATROL_RUN_4416"}),/WORK_COORDINATE_MISSING:expectedUserTurnId/);
});
