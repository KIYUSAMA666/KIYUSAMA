import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GuardianState } from "./control-core.mjs";
import { DurableBodyLock, DurableLedger } from "./durable-core.mjs";
import { SendGateError, openSendGate, commitSendStarted } from "./send-gate.mjs";

function rig(){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-gate-"));
 return {lock:new DurableBodyLock(path.join(d,"lock.json")),ledger:new DurableLedger(path.join(d,"ledger.json"))};
}
function precommit(r,bodyId="SORA_01",ownerId="proc-A"){
 r.ledger.record(bodyId,{state:GuardianState.LOCKED,ownerId,workId:"W",expectedUserTurnId:"U",preSendCommitted:true,sendStarted:false,resultCommitted:false});
}

test("SEND blocked without BODY lock",()=>{
 const r=rig(); precommit(r);
 assert.throws(()=>openSendGate({bodyId:"SORA_01",ownerId:"proc-A",workId:"W",expectedUserTurnId:"U",...r}),e=>e instanceof SendGateError&&e.reason==="BODY_LOCK_MISSING");
});
test("SEND blocked without PRE-SEND durable commit",()=>{
 const r=rig(); r.lock.acquire({bodyId:"SORA_01",ownerId:"proc-A"});
 assert.throws(()=>openSendGate({bodyId:"SORA_01",ownerId:"proc-A",workId:"W",expectedUserTurnId:"U",...r}),e=>e instanceof SendGateError&&e.reason==="PRE_SEND_COMMIT_MISSING");
});
test("SEND blocked when lock owner and ledger owner differ",()=>{
 const r=rig(); r.lock.acquire({bodyId:"SORA_01",ownerId:"proc-A"}); precommit(r,"SORA_01","proc-B");
 assert.throws(()=>openSendGate({bodyId:"SORA_01",ownerId:"proc-A",workId:"W",expectedUserTurnId:"U",...r}),e=>e instanceof SendGateError&&e.reason==="PRE_SEND_OWNER_MISMATCH");
});
test("SEND gate opens only with owned lock plus durable PRE-SEND",()=>{
 const r=rig(); r.lock.acquire({bodyId:"SORA_01",ownerId:"proc-A"}); precommit(r);
 const out=openSendGate({bodyId:"SORA_01",ownerId:"proc-A",workId:"W",expectedUserTurnId:"U",...r});
 assert.equal(out.state,GuardianState.SENDING); assert.equal(out.seq,2);
 assert.equal(new DurableLedger(r.ledger.file).get("SORA_01").sendStarted,true);
});
test("SEND_STARTED is durably committed before adapter side effect",()=>{
 const r=rig(); r.lock.acquire({bodyId:"SORA_01",ownerId:"proc-A"}); precommit(r);
 const e=commitSendStarted({bodyId:"SORA_01",ownerId:"proc-A",workId:"W",expectedUserTurnId:"U",...r});
 assert.equal(e.state,GuardianState.SENDING); assert.equal(e.sendStarted,true); assert.equal(e.seq,2);
 const reopened=new DurableLedger(r.ledger.file);
 assert.equal(reopened.get("SORA_01").sendStarted,true);
});
test("second SEND attempt is blocked after SEND_STARTED",()=>{
 const r=rig(); r.lock.acquire({bodyId:"SORA_01",ownerId:"proc-A"}); precommit(r);
 commitSendStarted({bodyId:"SORA_01",ownerId:"proc-A",workId:"W",expectedUserTurnId:"U",...r});
 assert.throws(()=>openSendGate({bodyId:"SORA_01",ownerId:"proc-A",workId:"W",expectedUserTurnId:"U",...r}),SendGateError);
});


test("SEND_STARTED preserves durable work coordinate for RETURN", () => {
  const r=rig();
  r.lock.acquire({bodyId:"SORA_01",ownerId:"owner-A"});
  r.ledger.record("SORA_01",{state:GuardianState.LOCKED,ownerId:"owner-A",workId:"work-1",expectedUserTurnId:"U",preSendCommitted:true,sendStarted:false,resultCommitted:false});
  const started=commitSendStarted({bodyId:"SORA_01",ownerId:"owner-A",workId:"work-1",expectedUserTurnId:"U",lock:r.lock,ledger:r.ledger});
  assert.equal(started.workId,"work-1");
  assert.equal(r.ledger.get("SORA_01").workId,"work-1");
});
