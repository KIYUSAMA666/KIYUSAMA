import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DurableBodyLock, DurableLedger } from "./durable-core.mjs";
import {
  GuardianState,
  GuardianTransitionError,
  canTransition,
  transition,
  recoverAfterUnknownSend,
  mayAttemptSend,
} from "./control-core.mjs";

test("UNCERTAIN has no outbound transition", () => {
  for (const target of Object.values(GuardianState)) {
    assert.equal(canTransition(GuardianState.UNCERTAIN, target), false);
  }
});

test("UNCERTAIN can never return to SEND-capable LOCKED", () => {
  assert.equal(mayAttemptSend(GuardianState.UNCERTAIN), false);
  assert.throws(
    () => transition(GuardianState.UNCERTAIN, GuardianState.LOCKED),
    GuardianTransitionError,
  );
  assert.throws(
    () => transition(GuardianState.UNCERTAIN, GuardianState.SENDING),
    GuardianTransitionError,
  );
});

test("unknown outcome after SEND_STARTED recovers as UNCERTAIN", () => {
  const recovered = recoverAfterUnknownSend({
    sendStarted: true,
    returnProven: false,
    resultCommitted: false,
  });
  assert.equal(recovered, GuardianState.UNCERTAIN);
  assert.equal(mayAttemptSend(recovered), false);
});

test("pre-send crash does not become UNCERTAIN", () => {
  assert.equal(
    recoverAfterUnknownSend({
      sendStarted: false,
      returnProven: false,
      resultCommitted: false,
    }),
    GuardianState.CRASHED,
  );
});

test("normal send path remains explicit", () => {
  assert.equal(transition(GuardianState.READY, GuardianState.LOCKED), GuardianState.LOCKED);
  assert.equal(mayAttemptSend(GuardianState.LOCKED), true);
  assert.throws(() => transition(GuardianState.LOCKED, GuardianState.SENDING), GuardianTransitionError);
  assert.equal(
    transition(GuardianState.SENDING, GuardianState.WAITING_RETURN),
    GuardianState.WAITING_RETURN,
  );
  assert.equal(
    transition(GuardianState.WAITING_RETURN, GuardianState.RESULT_COMMITTED),
    GuardianState.RESULT_COMMITTED,
  );
});

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-send-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const context = { bodyId: "canonical-body", ownerId: "owner-A", workId: "work-1",
    lock: new DurableBodyLock(path.join(dir, "lock.json")),
    ledger: new DurableLedger(path.join(dir, "ledger.json")) };
  const prepare = () => context.ledger.record(context.bodyId, {
    state: "PRE_SEND", ownerId: context.ownerId, workId: context.workId,
    sendStarted: false, resultCommitted: false });
  return { context, prepare };
}

test("SEND denies missing lock or durable PRE_SEND", t => {
  const { context, prepare } = fixture(t);
  prepare();
  assert.throws(() => transition("LOCKED", "SENDING", context), /BODY_LOCK_REQUIRED/);
  context.lock.acquire(context);
  fs.unlinkSync(context.ledger.file);
  assert.throws(() => transition("LOCKED", "SENDING", context), /DURABLE_PRE_SEND_REQUIRED/);
});

test("SEND verifies ownership and exact work coordinate", t => {
  const { context, prepare } = fixture(t);
  context.lock.acquire(context); prepare();
  assert.throws(() => transition("LOCKED", "SENDING", { ...context, ownerId: "B" }), /BODY_LOCK_REQUIRED/);
  assert.throws(() => transition("LOCKED", "SENDING", { ...context, workId: "other" }), /DURABLE_PRE_SEND_REQUIRED/);
});

test("SEND_STARTED is durable before permission and blocks second permission", t => {
  const { context, prepare } = fixture(t);
  context.lock.acquire(context); prepare();
  assert.equal(transition("LOCKED", "SENDING", context), "SENDING");
  const reopened = new DurableLedger(context.ledger.file);
  assert.equal(reopened.get(context.bodyId).sendStarted, true);
  assert.throws(() => transition("LOCKED", "SENDING", context), /DURABLE_PRE_SEND_REQUIRED/);
  assert.throws(() => transition("CRASHED", "READY", { ...context, ledger: reopened }), /RECOVERY_NOT_PROVEN_PRE_SEND/);
});

test("crash path cannot reset unknown SEND without ledger proof", () => {
  assert.equal(transition("SENDING", "CRASHED"), "CRASHED");
  for (const to of ["READY", "AUTH_REQUIRED", "DOM_DRIFT"]) {
    assert.throws(() => transition("CRASHED", to), /RECOVERY_NOT_PROVEN_PRE_SEND/);
  }
});

test("durable write failure grants no SENDING", t => {
  const { context, prepare } = fixture(t);
  context.lock.acquire(context); prepare();
  context.ledger.record = () => { throw new Error("FSYNC_FAILURE"); };
  assert.throws(() => transition("LOCKED", "SENDING", context), /FSYNC_FAILURE/);
});
