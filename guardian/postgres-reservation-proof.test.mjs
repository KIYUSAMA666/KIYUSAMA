import test from "node:test";
import assert from "node:assert/strict";
import { mapReservationCheckpoint } from "./postgres-reservation-proof.mjs";

const expected = Object.freeze({
  rootTaskId:"task-1",checkpointId:"checkpoint-1",expectedRevision:4,
  bodyId:"SORA_03",workId:"work-1",expectedUserTurnId:"turn-1",
  ownerId:"owner-1",leaseToken:"lease-1",fenceEpoch:7,
});
function validRow() {
  return {
    root_task_id:"task-1",checkpoint_id:"checkpoint-1",checkpoint_revision:5,
    checkpoint:{
      bodyId:"SORA_03",workId:"work-1",expectedUserTurnId:"turn-1",
      ownerId:"owner-1",leaseToken:"lease-1",fenceEpoch:7,
      state:"SENDING",sendStarted:true,preSendCommitted:true,resultCommitted:false,
    },
  };
}
test("reservation proof accepts only matching committed checkpoint",()=>{
  const proof=mapReservationCheckpoint(validRow(),expected);
  assert.equal(proof.ok,true);
  assert.equal(proof.revision,5);
  assert.equal(proof.fenceEpoch,7);
  assert.equal(Object.isFrozen(proof),true);
});
for (const [name,mutate] of [
  ["root task mismatch",r=>r.root_task_id="other-task"],
  ["checkpoint mismatch",r=>r.checkpoint_id="other-checkpoint"],
  ["stale revision",r=>r.checkpoint_revision=4],
  ["future revision",r=>r.checkpoint_revision=6],
  ["wrong body",r=>r.checkpoint.bodyId="SORA_02"],
  ["wrong work",r=>r.checkpoint.workId="other-work"],
  ["wrong user turn",r=>r.checkpoint.expectedUserTurnId="other-turn"],
  ["wrong owner",r=>r.checkpoint.ownerId="other-owner"],
  ["forged lease",r=>r.checkpoint.leaseToken="forged"],
  ["stale fence",r=>r.checkpoint.fenceEpoch=6],
  ["wrong state",r=>r.checkpoint.state="LOCKED"],
  ["send not started",r=>r.checkpoint.sendStarted=false],
  ["missing pre-send",r=>r.checkpoint.preSendCommitted=false],
  ["result already committed",r=>r.checkpoint.resultCommitted=true],
  ["missing checkpoint",r=>delete r.checkpoint],
]) {
  test("reservation proof rejects "+name,()=>{
    const row=validRow();mutate(row);
    assert.throws(()=>mapReservationCheckpoint(row,expected),/RESERVATION_PROOF_INVALID/);
  });
}
