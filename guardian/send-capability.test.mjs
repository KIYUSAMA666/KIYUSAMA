import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GuardianState } from "./control-core.mjs";
import { DurableBodyLock, DurableLedger } from "./durable-core.mjs";
import { createGuardianSendCapability, createEffectfulSendPort, GuardianCapabilityError } from "./send-capability.mjs";

function rig(){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-cap-"));
 const lock=new DurableBodyLock(path.join(d,"lock.json"));
 const ledger=new DurableLedger(path.join(d,"ledger.json"));
 lock.acquire({bodyId:"SORA_01",ownerId:"proc-A"});
 ledger.record("SORA_01",{state:GuardianState.LOCKED,ownerId:"proc-A",preSendCommitted:true,sendStarted:false,resultCommitted:false});
 return {lock,ledger};
}

test("raw effectful port rejects adapter direct call",async()=>{
 let sends=0; const port=createEffectfulSendPort(async()=>{sends++;});
 await assert.rejects(()=>port(Symbol("fake"),"hello"),GuardianCapabilityError);
 assert.equal(sends,0);
});

test("guardian capability commits SEND_STARTED before effect",async()=>{
 const r=rig(); const order=[];
 const originalRecord=r.ledger.record.bind(r.ledger);
 r.ledger.record=(...args)=>{const out=originalRecord(...args); if(out.sendStarted) order.push("LEDGER"); return out;};
 const port=createEffectfulSendPort(async()=>{order.push("SEND"); return "ok";});
 const cap=createGuardianSendCapability({...r,bodyId:"SORA_01",ownerId:"proc-A",effectfulSend:port});
 assert.equal(await cap.send("hello"),"ok");
 assert.deepEqual(order,["LEDGER","SEND"]);
 assert.equal(new DurableLedger(r.ledger.file).get("SORA_01").sendStarted,true);
});

test("missing gate prerequisites means zero effectful SEND",async()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-cap-"));
 const lock=new DurableBodyLock(path.join(d,"lock.json"));
 const ledger=new DurableLedger(path.join(d,"ledger.json"));
 let sends=0; const port=createEffectfulSendPort(async()=>{sends++;});
 const cap=createGuardianSendCapability({bodyId:"SORA_01",ownerId:"proc-A",lock,ledger,effectfulSend:port});
 await assert.rejects(()=>cap.send("hello"));
 assert.equal(sends,0);
});

test("second capability SEND is blocked after SEND_STARTED",async()=>{
 const r=rig(); let sends=0;
 const port=createEffectfulSendPort(async()=>{sends++; return "ok";});
 const cap=createGuardianSendCapability({...r,bodyId:"SORA_01",ownerId:"proc-A",effectfulSend:port});
 assert.equal(await cap.send("one"),"ok");
 await assert.rejects(()=>cap.send("two"));
 assert.equal(sends,1);
});
