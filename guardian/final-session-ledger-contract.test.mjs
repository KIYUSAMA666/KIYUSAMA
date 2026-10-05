import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";import os from "node:os";import path from "node:path";
import {DurableBodyLock,DurableLedger} from "./durable-core.mjs";import {GuardianState} from "./control-core.mjs";import {assembleFinalSessionAdapter} from "./final-session-adapter.mjs";
test("final session preserves all durable coordinates from PRE-SEND through RESULT_COMMITTED",async()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-e2e-"));const lock=new DurableBodyLock(path.join(d,"lock.json"));const ledger=new DurableLedger(path.join(d,"ledger.json"));
 const coord={bodyId:"BODY-1",ownerId:"OWNER-1",workId:"WORK-1",expectedUserTurnId:"USER-1"};
 lock.acquire({bodyId:coord.bodyId,ownerId:coord.ownerId});
 ledger.record(coord.bodyId,{state:GuardianState.LOCKED,ownerId:coord.ownerId,workId:coord.workId,expectedUserTurnId:coord.expectedUserTurnId,preSendCommitted:true,sendStarted:false,resultCommitted:false});
 let sendSnapshot,resultSnapshot;
 const adapter=assembleFinalSessionAdapter({...coord,lock,ledger,observe:()=>null,compose:()=>null,
  rawSend:async()=>{sendSnapshot=new DurableLedger(ledger.file).get(coord.bodyId);},
  rawResultCommit:async({saved})=>{resultSnapshot=new DurableLedger(ledger.file).get(coord.bodyId);return saved;},
  captureReturn:async()=>({causalUserTurnId:coord.expectedUserTurnId,assistantTurnId:"ASSISTANT-2",streamEnded:true,contentStable:true,sameBody:true})
 });
 await adapter.send("payload");
 for(const [k,v] of Object.entries(coord)) assert.equal(sendSnapshot[k],v,"SEND_STARTED lost "+k);
 assert.equal(sendSnapshot.state,GuardianState.SENDING);assert.equal(sendSnapshot.sendStarted,true);
 await adapter.capture();
 for(const [k,v] of Object.entries(coord)) assert.equal(resultSnapshot[k],v,"RESULT_COMMITTED lost "+k);
 assert.equal(resultSnapshot.state,GuardianState.RESULT_COMMITTED);assert.equal(resultSnapshot.resultCommitted,true);
 const reopened=new DurableLedger(ledger.file).get(coord.bodyId);
 for(const [k,v] of Object.entries(coord)) assert.equal(reopened[k],v,"restart lost "+k);
 assert.equal(reopened.state,GuardianState.RESULT_COMMITTED);
});