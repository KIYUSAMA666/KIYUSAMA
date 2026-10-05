import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { DurableBodyLock,DurableLedger } from "./durable-core.mjs";
import { GuardianState } from "./control-core.mjs";
import { assembleGuardianSessionCapabilities } from "./guardian-session-assembly.mjs";

function rig(){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-session-"));
 const lock=new DurableBodyLock(path.join(d,"lock.json")); const ledger=new DurableLedger(path.join(d,"ledger.json"));
 lock.acquire({bodyId:"SORA_01",ownerId:"A"});
 ledger.record("SORA_01",{state:GuardianState.LOCKED,ownerId:"A",workId:"W",expectedUserTurnId:"u1",preSendCommitted:true,sendStarted:false,resultCommitted:false});
 let sends=0,results=0;
 const cap=assembleGuardianSessionCapabilities({bodyId:"SORA_01",ownerId:"A",workId:"W",expectedUserTurnId:"u1",lock,ledger,
  rawSend:async()=>{sends++;},rawResultCommit:async({saved})=>{results++;return saved;}});
 return {cap,ledger,get sends(){return sends;},get results(){return results;}};
}
const good={causalUserTurnId:"u1",assistantTurnId:"a2",streamEnded:true,contentStable:true,sameBody:true};

test("session assembly exposes only guarded send and capture",()=>{
 const r=rig(); assert.deepEqual(Object.keys(r.cap),["send","capture"]);
});
test("same session coordinate drives SEND then RETURN",async()=>{
 const r=rig(); await r.cap.send("payload");
 const started=r.ledger.get("SORA_01"); assert.equal(started.sendStarted,true); assert.equal(started.ownerId,"A"); assert.equal(started.workId,"W");
 const out=await r.cap.capture(good); assert.equal(r.sends,1); assert.equal(r.results,1); assert.equal(out.state,GuardianState.RESULT_COMMITTED);
});
test("RETURN cannot switch work coordinate after SEND",async()=>{
 const r=rig(); await r.cap.send("payload");
 r.ledger.record("SORA_01",{...r.ledger.get("SORA_01"),workId:"OTHER"});
 await assert.rejects(()=>r.cap.capture(good),/RETURN_COORDINATE_MISMATCH/); assert.equal(r.results,0);
});
test("bad SAME BODY proof never reaches result commit",async()=>{
 const r=rig(); await r.cap.send("payload");
 await assert.rejects(()=>r.cap.capture({...good,sameBody:false})); assert.equal(r.results,0);
});
test("second SEND and second RESULT are both blocked",async()=>{
 const r=rig(); await r.cap.send("payload"); await assert.rejects(()=>r.cap.send("again")); assert.equal(r.sends,1);
 await r.cap.capture(good); await assert.rejects(()=>r.cap.capture(good)); assert.equal(r.results,1);
});
