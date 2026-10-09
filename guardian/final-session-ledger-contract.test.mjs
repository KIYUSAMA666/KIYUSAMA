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

test("final session blocks SEND when PRE-SEND work coordinate differs",async()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-e2e-work-mismatch-"));const lock=new DurableBodyLock(path.join(d,"lock.json"));const ledger=new DurableLedger(path.join(d,"ledger.json"));
 lock.acquire({bodyId:"B",ownerId:"O"});ledger.record("B",{state:GuardianState.LOCKED,ownerId:"O",workId:"OTHER",expectedUserTurnId:"U",preSendCommitted:true,sendStarted:false,resultCommitted:false});
 let sends=0;const adapter=assembleFinalSessionAdapter({bodyId:"B",ownerId:"O",workId:"W",expectedUserTurnId:"U",lock,ledger,rawSend:async()=>{sends++},rawResultCommit:async()=>{},observe:()=>null,compose:()=>null,captureReturn:async()=>({})});
 await assert.rejects(()=>adapter.send("p"),/PRE_SEND_WORK_MISMATCH/);assert.equal(sends,0);
});
test("final session blocks SEND when PRE-SEND expected user turn differs",async()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-e2e-turn-mismatch-"));const lock=new DurableBodyLock(path.join(d,"lock.json"));const ledger=new DurableLedger(path.join(d,"ledger.json"));
 lock.acquire({bodyId:"B",ownerId:"O"});ledger.record("B",{state:GuardianState.LOCKED,ownerId:"O",workId:"W",expectedUserTurnId:"OTHER",preSendCommitted:true,sendStarted:false,resultCommitted:false});
 let sends=0;const adapter=assembleFinalSessionAdapter({bodyId:"B",ownerId:"O",workId:"W",expectedUserTurnId:"U",lock,ledger,rawSend:async()=>{sends++},rawResultCommit:async()=>{},observe:()=>null,compose:()=>null,captureReturn:async()=>({})});
 await assert.rejects(()=>adapter.send("p"),/PRE_SEND_USER_TURN_MISMATCH/);assert.equal(sends,0);
});

test("pending external result survives restart and clears only after one successful resume",async()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),"guardian-pending-result-"));
 const lock=new DurableBodyLock(path.join(d,"lock.json")); const ledger=new DurableLedger(path.join(d,"ledger.json"));
 const coord={bodyId:"BODY-P",ownerId:"OWNER-P",workId:"WORK-P",expectedUserTurnId:"USER-P"};
 lock.acquire({bodyId:coord.bodyId,ownerId:coord.ownerId});
 ledger.record(coord.bodyId,{state:GuardianState.SENDING,...coord,preSendCommitted:true,sendStarted:true,resultCommitted:false});
 let external=0;
 const first=assembleFinalSessionAdapter({...coord,lock,ledger,observe:()=>null,compose:()=>null,rawSend:async()=>{},rawResultCommit:async()=>{external++;throw new Error("SIMULATED_CRASH_BEFORE_EXTERNAL_CONFIRM")},captureReturn:async()=>({causalUserTurnId:coord.expectedUserTurnId,assistantTurnId:"ASSISTANT-P",streamEnded:true,contentStable:true,sameBody:true})});
 await assert.rejects(()=>first.capture(),/SIMULATED_CRASH/);
 let saved=new DurableLedger(ledger.file).get(coord.bodyId);
 assert.equal(saved.state,GuardianState.RESULT_COMMITTED); assert.equal(saved.resultCommitted,true); assert.equal(saved.externalResultPending,true);
 const restarted=assembleFinalSessionAdapter({...coord,lock,ledger,observe:()=>null,compose:()=>null,rawSend:async()=>{},rawResultCommit:async()=>{external++;return "CONFIRMED"},captureReturn:async()=>({})});
 assert.equal(await restarted.resumePendingResult(coord.bodyId),"CONFIRMED");
 saved=new DurableLedger(ledger.file).get(coord.bodyId);
 assert.equal(saved.externalResultPending,false); assert.equal(saved.externalResultCompleted,true); assert.equal(external,2);
 await assert.rejects(()=>restarted.resumePendingResult(coord.bodyId),/NO_PENDING_EXTERNAL_RESULT/); assert.equal(external,2);
});