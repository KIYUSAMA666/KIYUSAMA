import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DurableBodyLock, BodyLockError, DurableLedger, recoveryDecision } from "./durable-core.mjs";

function temp(name){ const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-")); return path.join(d,name); }

test("same BODY cannot be owned by two owners",()=>{
 const lock=new DurableBodyLock(temp("body.lock"));
 lock.acquire({bodyId:"SORA_01",ownerId:"proc-A"});
 assert.throws(()=>lock.acquire({bodyId:"SORA_01",ownerId:"proc-B"}),BodyLockError);
});

test("non-owner cannot release BODY lock",()=>{
 const lock=new DurableBodyLock(temp("body.lock"));
 lock.acquire({bodyId:"SORA_01",ownerId:"proc-A"});
 assert.throws(()=>lock.release({bodyId:"SORA_01",ownerId:"proc-B"}),BodyLockError);
 assert.equal(lock.read().ownerId,"proc-A");
});

test("ledger survives new instance/process boundary",()=>{
 const file=temp("ledger.json");
 new DurableLedger(file).record("SORA_01",{state:"SENDING",sendStarted:true,resultCommitted:false});
 const reopened=new DurableLedger(file);
 assert.equal(reopened.get("SORA_01").state,"SENDING");
 assert.equal(reopened.get("SORA_01").sendStarted,true);
 assert.equal(recoveryDecision(reopened.get("SORA_01")),"UNCERTAIN");
});

test("RESULT_COMMITTED survives restart and is not uncertain",()=>{
 const file=temp("ledger.json");
 const l=new DurableLedger(file);
 l.record("SORA_01",{state:"RESULT_COMMITTED",sendStarted:true,resultCommitted:true});
 const reopened=new DurableLedger(file);
 assert.equal(recoveryDecision(reopened.get("SORA_01")),"RESULT_COMMITTED");
});

test("ledger sequence advances durably",()=>{
 const file=temp("ledger.json"); const l=new DurableLedger(file);
 assert.equal(l.record("SORA_01",{state:"LOCKED",sendStarted:false}).seq,1);
 assert.equal(l.record("SORA_01",{state:"SENDING",sendStarted:true}).seq,2);
 assert.equal(new DurableLedger(file).get("SORA_01").seq,2);
});
