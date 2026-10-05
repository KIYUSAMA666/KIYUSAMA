import test from "node:test";
import assert from "node:assert/strict";
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
  assert.equal(transition(GuardianState.LOCKED, GuardianState.SENDING), GuardianState.SENDING);
  assert.equal(
    transition(GuardianState.SENDING, GuardianState.WAITING_RETURN),
    GuardianState.WAITING_RETURN,
  );
  assert.equal(
    transition(GuardianState.WAITING_RETURN, GuardianState.RESULT_COMMITTED),
    GuardianState.RESULT_COMMITTED,
  );
});
