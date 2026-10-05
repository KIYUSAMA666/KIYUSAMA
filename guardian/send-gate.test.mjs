import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DurableBodyLock, DurableLedger, recoveryDecision } from "./durable-core.mjs";
import { beginSending } from "./send-gate.mjs";
function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-gate-"));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const lock=new DurableBodyLock(path.join(dir,"lock.json"));
 const ledger=new DurableLedger(path.join(dir,"ledger.json"));
 return { lock, ledger, bodyId:"canonical", ownerId:"owner-A", workId:"work-1" };
}
function prepare(f) {
 f.lock.acquire(f);
 f.ledger.record(f.bodyId,{ownerId:f.ownerId,workId:f.workId,state:"LOCKED",phase:"PRE_SEND",sendStarted:false,resultCommitted:false});
}
test("both prerequisites persist SEND_STARTED; restart is UNCERTAIN",t=>{
 const f=fixture(t); prepare(f);
 assert.equal(beginSending(f).state,"SENDING");
 const fresh=new DurableLedger(f.ledger.file);
 assert.equal(recoveryDecision(fresh.get(f.bodyId)),"UNCERTAIN");
 assert.throws(()=>beginSending(f));
});
test("ledger alone cannot send",t=>{
 const f=fixture(t);prepare(f);f.lock.release(f);assert.throws(()=>beginSending(f),/LOCK_NOT_OWNED/);
 assert.equal(f.ledger.get(f.bodyId).sendStarted,false);
});
test("lock alone cannot send",t=>{
 const f=fixture(t);f.lock.acquire(f);assert.throws(()=>beginSending(f),/LEDGER_COORDINATE/);
});
test("other owner and work rejected",t=>{
 const f=fixture(t);prepare(f);
 assert.throws(()=>beginSending({...f,ownerId:"owner-B"}),/LOCK_NOT_OWNED/);
 assert.throws(()=>beginSending({...f,workId:"other-work"}),/LEDGER_COORDINATE/);
});
test("durable write failure grants no permission",t=>{
 const f=fixture(t);prepare(f);f.ledger.record=()=>{throw Error("DISK_FAILURE");};
 assert.throws(()=>beginSending(f),/DISK_FAILURE/);
});
test("missing SEND_STARTED readback grants no permission",t=>{
 const f=fixture(t);prepare(f);const get=f.ledger.get.bind(f.ledger);let calls=0;
 f.ledger.get=id=>++calls===1?get(id):null;
 assert.throws(()=>beginSending(f),/READBACK_FAILED/);
});
test("ownership lost after persistence fails closed, restart uncertain",t=>{
 const f=fixture(t);prepare(f);const record=f.ledger.record.bind(f.ledger);
 f.ledger.record=(...args)=>{const r=record(...args);f.lock.release(f);return r;};
 assert.throws(()=>beginSending(f),/LOCK_NOT_OWNED/);
 assert.equal(recoveryDecision(f.ledger.get(f.bodyId)),"UNCERTAIN");
});
