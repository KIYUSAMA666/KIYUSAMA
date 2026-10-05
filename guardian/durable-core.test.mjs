import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
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


test("two processes racing for one BODY produce exactly one owner",async()=>{
 const file=temp("body.lock");
 const moduleUrl=new URL("./durable-core.mjs",import.meta.url).href;
 const script=`import {DurableBodyLock,BodyLockError} from ${JSON.stringify(moduleUrl)};const [file,owner]=process.argv.slice(1);try{new DurableBodyLock(file).acquire({bodyId:"SORA_01",ownerId:owner});process.stdout.write("WON")}catch(e){if(e instanceof BodyLockError && e.message==="BODY_ALREADY_OWNED"){process.stdout.write("BLOCKED:BODY_ALREADY_OWNED")}else{process.stdout.write("ERROR:"+e.name+":"+e.message);process.exitCode=2}}`;
 const run=owner=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,["--input-type=module","-e",script,file,owner]);let out="";p.stdout.on("data",d=>out+=d);p.on("error",reject);p.on("close",()=>resolve(out));});
 const [a,b]=await Promise.all([run("proc-A"),run("proc-B")]);
 assert.equal([a,b].filter(x=>x==="WON").length,1);
 assert.equal([a,b].filter(x=>x==="BLOCKED:BODY_ALREADY_OWNED").length,1);\n assert.equal([a,b].filter(x=>x.startsWith("ERROR:")).length,0);
 const saved=new DurableBodyLock(file).read();
 assert.ok(saved.ownerId==="proc-A"||saved.ownerId==="proc-B");
});