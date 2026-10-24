import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { GuardianState } from "./control-core.mjs";
import { DurableLedger } from "./durable-core.mjs";
import { createGuardianReturnCapability,createEffectfulResultCommitPort,ReturnCapabilityError } from "./return-capability.mjs";

function rig(){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-retcap-")); const ledger=new DurableLedger(path.join(d,"ledger.json"));
 ledger.record("SORA_01",{state:GuardianState.SENDING,ownerId:"A",workId:"W",sendStarted:true,resultCommitted:false});
 return ledger;
}
function proof(){return {bodyId:"SORA_01",ownerId:"A",workId:"W",expectedUserTurnId:"u1",causalUserTurnId:"u1",assistantTurnId:"a2",streamEnded:true,contentStable:true,sameBody:true};}

test("raw RESULT commit rejects direct adapter call",async()=>{
 let n=0; const port=createEffectfulResultCommitPort(async()=>{n++;});
 await assert.rejects(()=>port(Symbol("fake"),{}),ReturnCapabilityError); assert.equal(n,0);
});
test("effectful RESULT commit occurs only after durable RETURN gate commit",async()=>{
 const ledger=rig(); let seen;
 const port=createEffectfulResultCommitPort(async({saved})=>{seen=new DurableLedger(ledger.file).get("SORA_01"); return saved;});
 const cap=createGuardianReturnCapability({ledger,effectfulResultCommit:port});
 const out=await cap.commit(proof());
 assert.equal(seen.resultCommitted,true); assert.equal(seen.state,GuardianState.RESULT_COMMITTED); assert.equal(out.resultCommitted,true);
});
test("bad RETURN proof means zero effectful RESULT commit",async()=>{
 const ledger=rig(); let n=0;
 const cap=createGuardianReturnCapability({ledger,effectfulResultCommit:createEffectfulResultCommitPort(async()=>{n++;})});
 await assert.rejects(()=>cap.commit({...proof(),sameBody:false})); assert.equal(n,0);
});
test("duplicate RESULT commit cannot reach effectful port twice",async()=>{
 const ledger=rig(); let n=0;
 const cap=createGuardianReturnCapability({ledger,effectfulResultCommit:createEffectfulResultCommitPort(async()=>{n++;})});
 await cap.commit(proof()); await assert.rejects(()=>cap.commit(proof())); assert.equal(n,1);
});
