import test from 'node:test';
import assert from 'node:assert/strict';
import { mapReservationCheckpoint } from './postgres-reservation-proof.mjs';
const expected={rootTaskId:900001,checkpointId:'checkpoint-2',expectedRevision:1,bodyId:'SORA_03',workId:'ci-work',expectedUserTurnId:'ci-turn',ownerId:'ci-owner',leaseToken:'lease',fenceEpoch:3};
const checkpoint={bodyId:'SORA_03',workId:'ci-work',expectedUserTurnId:'ci-turn',ownerId:'ci-owner',leaseToken:'lease',fenceEpoch:3,state:'SENDING',sendStarted:true,preSendCommitted:true,resultCommitted:false};
test('accepts PostgreSQL int8 decimal strings',()=>{
  const result=mapReservationCheckpoint({root_task_id:'900001',checkpoint_id:'checkpoint-2',checkpoint_revision:'2',checkpoint},expected);
  assert.equal(result.revision,2);
});
test('rejects incorrect checkpoint revision',()=>{
  assert.throws(()=>mapReservationCheckpoint({root_task_id:'900001',checkpoint_id:'checkpoint-2',checkpoint_revision:'3',checkpoint},expected),/RESERVATION_PROOF_INVALID/);
});
test('rejects stale lease in returned checkpoint',()=>{
  assert.throws(()=>mapReservationCheckpoint({root_task_id:'900001',checkpoint_id:'checkpoint-2',checkpoint_revision:'2',checkpoint:{...checkpoint,leaseToken:'stale'}},expected),/RESERVATION_PROOF_INVALID/);
});
