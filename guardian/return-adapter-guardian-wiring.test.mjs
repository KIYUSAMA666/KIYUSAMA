import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { GuardianState } from "./control-core.mjs";
import { DurableLedger } from "./durable-core.mjs";
import { createReturnAdapterGuardianWiring,assertNoRawReturnAuthority } from "./return-adapter-guardian-wiring.mjs";

function rig(captureReturn){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-retwire-"));
 const ledger=new DurableLedger(path.join(d,"ledger.json"));
 ledger.record("SORA_01",{state:GuardianState.SENDING,ownerId:"A",workId:"W",sendStarted:true,resultCommitted:false});
 let commits=0;
 const adapter=createReturnAdapterGuardianWiring({
  bodyId:"SORA_01",ownerId:"A",workId:"W",expectedUserTurnId:"u1",ledger,captureReturn,
  rawResultCommit:async payload=>{commits++; return payload.saved;}
 });
 return {adapter,ledger,get commits(){return commits;}};
}
const good=()=>({causalUserTurnId:"u1",assistantTurnId:"a2",streamEnded:true,contentStable:true,sameBody:true});

test("public RETURN wiring exposes capture only and no raw commit authority",()=>{
 const r=rig(good); assert.deepEqual(Object.keys(r.adapter),["capture"]); assert.equal(assertNoRawReturnAuthority(r.adapter),true);
 for(const k of ["rawResultCommit","commitReturnResult","effectfulResultCommit","ledger","guardianReturn","captureReturn"]) assert.equal(k in r.adapter,false);
});
test("capture commits only after trusted observation passes RETURN gate",async()=>{
 const r=rig(good); const out=await r.adapter.capture();
 assert.equal(r.commits,1); assert.equal(out.state,GuardianState.RESULT_COMMITTED);
 assert.equal(new DurableLedger(r.ledger.file).get("SORA_01").resultCommitted,true);
});
test("bad observation means zero raw RESULT commit",async()=>{
 const r=rig(()=>({...good(),sameBody:false}));
 await assert.rejects(()=>r.adapter.capture()); assert.equal(r.commits,0);
});
test("capture without durable SEND_STARTED means zero raw RESULT commit",async()=>{
 const r=rig(good); r.ledger.record("SORA_01",{state:GuardianState.LOCKED,ownerId:"A",workId:"W",sendStarted:false,resultCommitted:false});
 await assert.rejects(()=>r.adapter.capture()); assert.equal(r.commits,0);
});
test("duplicate capture cannot commit RESULT twice",async()=>{
 const r=rig(good); await r.adapter.capture(); await assert.rejects(()=>r.adapter.capture()); assert.equal(r.commits,1);
});
