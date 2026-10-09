import test from "node:test";
import assert from "node:assert/strict";
import { reserveCloudSend, CloudSendReservationError } from "./cloud-send-reservation.mjs";
const input = { bodyId:"SORA_03", workId:"W", expectedUserTurnId:"U", ownerId:"owner", leaseToken:"token", fenceEpoch:3, expectedRevision:7 };
const success = { ok:true, state:"SENDING", sendStarted:true, bodyId:"SORA_03", workId:"W", expectedUserTurnId:"U", ownerId:"owner", fenceEpoch:3, revision:8 };
test("accepts verified atomic reservation proof", async () => {
  const result = await reserveCloudSend({ ...input, reserve:async () => success });
  assert.equal(result.sendStarted,true);
  assert.equal(Object.isFrozen(result),true);
});
test("rejects stale epoch", async () => {
  await assert.rejects(reserveCloudSend({ ...input, reserve:async () => ({...success,fenceEpoch:2}) }), e => e instanceof CloudSendReservationError && e.reason==="RESERVATION_NOT_PROVEN");
});
test("rejects absent SEND_STARTED proof", async () => {
  await assert.rejects(reserveCloudSend({ ...input, reserve:async () => ({...success,sendStarted:false}) }), CloudSendReservationError);
});
test("ambiguous reservation errors fail closed", async () => {
  await assert.rejects(reserveCloudSend({ ...input, reserve:async () => { throw Error("timeout"); } }), e => e.reason==="RESERVATION_UNCERTAIN");
});
test("rejects missing coordinates before calling adapter", async () => {
  let calls=0;
  await assert.rejects(reserveCloudSend({ ...input, leaseToken:"", reserve:async () => { calls++; return success; } }), CloudSendReservationError);
  assert.equal(calls,0);
});
