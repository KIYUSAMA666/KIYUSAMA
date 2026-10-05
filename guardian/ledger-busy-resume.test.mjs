import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DurableLedger,DurableBodyLock,recoveryDecision} from './durable-core.mjs';
import {assembleGuardianSessionCapabilities} from './guardian-session-assembly.mjs';
for (const phase of ['SEND','RETURN']) test(phase+' BUSY: explicit resume once, duplicate blocked', async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guardian-busy-'));
 try {
 const bodyId='SORA_03',ownerId='owner',workId='work',expectedUserTurnId='user-turn';
 const ledger=new DurableLedger(path.join(dir,'ledger.json'));
 const lock=new DurableBodyLock(path.join(dir,'body.lock'));
 lock.acquire({bodyId,ownerId});
 ledger.record(bodyId,{ownerId,workId,expectedUserTurnId,state:phase==='SEND'?'LOCKED':'SENDING',preSendCommitted:true,sendStarted:phase==='RETURN',resultCommitted:false});
 let sends=0,results=0;
 const session=assembleGuardianSessionCapabilities({bodyId,ownerId,workId,expectedUserTurnId,lock,ledger,rawSend:async()=>++sends,rawResultCommit:async()=>++results});
 const action=()=>phase==='SEND'?session.send('payload'):session.capture({causalUserTurnId:expectedUserTurnId,assistantTurnId:'assistant-turn',streamEnded:true,contentStable:true,sameBody:true});
 const before=ledger.get(bodyId);
 fs.writeFileSync(ledger.lockFile,'held');
 await assert.rejects(action(),/LEDGER_UPDATE_BUSY/);
 assert.deepEqual(ledger.get(bodyId),before);
 assert.equal(sends+results,0);
 if(phase==='RETURN')assert.equal(recoveryDecision(ledger.get(bodyId)),'UNCERTAIN');
 fs.unlinkSync(ledger.lockFile);
 await action();
 assert.equal(sends+results,1);
 await assert.rejects(action());
 assert.equal(sends+results,1);
 assert.equal(ledger.get(bodyId).workId,workId);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
