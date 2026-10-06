import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { DurableBodyLock, DurableLedger } from "./durable-core.mjs";
import { enterOpenRoomWork } from "./open-room-guardian-entrypoint.mjs";

function fixture(overrides={}) {
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"open-room-guardian-"));
 const expected={bodyId:"KIRA_FIXED",ownerId:"OPEN_ROOM",workId:"WORK-1",expectedUserTurnId:"TURN-1"};
 let sends=0;
 return {expected,work:{...expected},lock:new DurableBodyLock(path.join(d,"body.lock")),ledger:new DurableLedger(path.join(d,"ledger.json")),
  authPreflight:()=>({pass:true,readOnly:true}),exactBodyPreflight:()=>({pass:true,readOnly:true,bodyId:"KIRA_FIXED"}),
  rawSend:async()=>{sends++},rawResultCommit:async()=>{},observe:()=>null,compose:()=>null,captureReturn:async()=>({}),
  sends:()=>sends,...overrides};
}
test("formal OPEN ROOM WORK reaches Guardian assembly with SEND=0",()=>{
 const x=fixture(); const r=enterOpenRoomWork(x);
 assert.equal(r.bodyId,x.expected.bodyId); assert.equal(r.workId,x.expected.workId); assert.equal(r.sendCount,0); assert.equal(x.sends(),0);
 assert.equal(x.lock.read().ownerId,x.expected.ownerId);
});
for (const [name,override,reason] of [
 ["AUTH", {authPreflight:()=>({pass:false,readOnly:true})}, "AUTH_NOT_PROVEN_READ_ONLY"],
 ["BODY", {exactBodyPreflight:()=>({pass:true,readOnly:true,bodyId:"WRONG"})}, "EXACT_BODY_MISMATCH"],
 ["WORK", {work:{bodyId:"KIRA_FIXED",ownerId:"OPEN_ROOM",workId:"WRONG",expectedUserTurnId:"TURN-1"}}, "WORK_COORDINATE_MISMATCH:workId"],
]) test(name+" mismatch fails before BODY LOCK / assembly",()=>{
 const x=fixture(override); assert.throws(()=>enterOpenRoomWork(x),new RegExp(reason));
 assert.equal(x.lock.read(),null); assert.equal(x.sends(),0);
});
