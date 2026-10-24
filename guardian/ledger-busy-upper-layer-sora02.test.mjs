import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {DurableBodyLock,DurableLedger} from "./durable-core.mjs";
import {createGuardianSendCapability,createEffectfulSendPort} from "./send-capability.mjs";
import {createGuardianReturnCapability,createEffectfulResultCommitPort} from "./return-capability.mjs";
function rig(state){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"busy-upper-"));
 const ledger=new DurableLedger(path.join(d,"ledger"));
 const lock=new DurableBodyLock(path.join(d,"body"));
 lock.acquire({bodyId:"B",ownerId:"O"});
 ledger.record("B",{state,ownerId:"O",workId:"W",expectedUserTurnId:"U",preSendCommitted:true,sendStarted:state==="SENDING",resultCommitted:false});
 fs.writeFileSync(ledger.lockFile,"held");
 return {d,ledger,lock};
}
test("SEND ledger BUSY prevents effect and preserves PRE-SEND",async()=>{
 const r=rig("LOCKED");let effects=0;
 try{
 const cap=createGuardianSendCapability({...r,bodyId:"B",ownerId:"O",workId:"W",expectedUserTurnId:"U",effectfulSend:createEffectfulSendPort(async()=>{effects++;})});
 await assert.rejects(()=>cap.send("payload"),/LEDGER_UPDATE_BUSY/);
 assert.equal(effects,0);assert.equal(r.ledger.get("B").sendStarted,false);assert.equal(r.ledger.get("B").state,"LOCKED");
 }finally{fs.rmSync(r.d,{recursive:true,force:true});}
});
test("RETURN ledger BUSY prevents external commit and preserves SEND_STARTED",async()=>{
 const r=rig("SENDING");let effects=0;
 try{
 const cap=createGuardianReturnCapability({ledger:r.ledger,effectfulResultCommit:createEffectfulResultCommitPort(async()=>{effects++;})});
 await assert.rejects(()=>cap.commit({bodyId:"B",ownerId:"O",workId:"W",expectedUserTurnId:"U",causalUserTurnId:"U",assistantTurnId:"A",streamEnded:true,contentStable:true,sameBody:true}),/LEDGER_UPDATE_BUSY/);
 assert.equal(effects,0);assert.equal(r.ledger.get("B").resultCommitted,false);assert.equal(r.ledger.get("B").sendStarted,true);
 }finally{fs.rmSync(r.d,{recursive:true,force:true});}
});
