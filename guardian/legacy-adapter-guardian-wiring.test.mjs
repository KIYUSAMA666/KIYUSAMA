import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GuardianState } from "./control-core.mjs";
import { DurableBodyLock, DurableLedger } from "./durable-core.mjs";
import { wireLegacyAdapterBehindGuardian } from "./legacy-adapter-guardian-wiring.mjs";

function rig(){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-wire-"));
 const lock=new DurableBodyLock(path.join(d,"lock.json"));
 const ledger=new DurableLedger(path.join(d,"ledger.json"));
 return {lock,ledger};
}

test("legacy raw click is not exposed by wired adapter",()=>{
 const r=rig();
 const adapter=wireLegacyAdapterBehindGuardian({...r,bodyId:"SORA_01",ownerId:"A",legacyEffectfulClick:async()=>{}});
 assert.deepEqual(Object.keys(adapter).sort(),["capture","compose","observe","send"]);
 for(const k of ["legacyEffectfulClick","rawSend","click_send_once","page","driver","surface"]) assert.equal(k in adapter,false);
});

test("legacy effectful click cannot run when Guardian prerequisites are absent",async()=>{
 const r=rig(); let clicks=0;
 const adapter=wireLegacyAdapterBehindGuardian({...r,bodyId:"SORA_01",ownerId:"A",legacyEffectfulClick:async()=>{clicks++;}});
 await assert.rejects(()=>adapter.send("x"));
 assert.equal(clicks,0);
});

test("legacy click runs only after durable SEND_STARTED",async()=>{
 const r=rig(); let observed=null;
 r.lock.acquire({bodyId:"SORA_01",ownerId:"A"});
 r.ledger.record("SORA_01",{state:GuardianState.LOCKED,ownerId:"A",preSendCommitted:true,sendStarted:false,resultCommitted:false});
 const adapter=wireLegacyAdapterBehindGuardian({...r,bodyId:"SORA_01",ownerId:"A",legacyEffectfulClick:async()=>{
   observed=new DurableLedger(r.ledger.file).get("SORA_01");
   return "clicked";
 }});
 assert.equal(await adapter.send("x"),"clicked");
 assert.equal(observed.sendStarted,true);
 assert.equal(observed.state,GuardianState.SENDING);
});

test("second adapter SEND cannot invoke legacy click twice",async()=>{
 const r=rig(); let clicks=0;
 r.lock.acquire({bodyId:"SORA_01",ownerId:"A"});
 r.ledger.record("SORA_01",{state:GuardianState.LOCKED,ownerId:"A",preSendCommitted:true,sendStarted:false,resultCommitted:false});
 const adapter=wireLegacyAdapterBehindGuardian({...r,bodyId:"SORA_01",ownerId:"A",legacyEffectfulClick:async()=>{clicks++;}});
 await adapter.send("one");
 await assert.rejects(()=>adapter.send("two"));
 assert.equal(clicks,1);
});
