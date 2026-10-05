import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GuardianState } from "./control-core.mjs";
import { DurableLedger } from "./durable-core.mjs";
import { ReturnGateError, commitReturnResult } from "./return-gate.mjs";

function rig() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-return-"));
  const ledger = new DurableLedger(path.join(d, "ledger.json"));
  ledger.record("SORA_01", {
    state: GuardianState.SENDING,
    ownerId: "owner-A",
    workId: "work-1",
    sendStarted: true,
    resultCommitted: false,
  });
  return { ledger };
}

function valid(r) {
  return {
    ...r,
    bodyId: "SORA_01",
    ownerId: "owner-A",
    workId: "work-1",
    expectedUserTurnId: "user-turn-7",
    causalUserTurnId: "user-turn-7",
    assistantTurnId: "assistant-turn-8",
    streamEnded: true,
    contentStable: true,
    sameBody: true,
  };
}

test("RETURN blocks without durable SEND_STARTED", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-return-"));
  const ledger = new DurableLedger(path.join(d, "ledger.json"));
  assert.throws(() => commitReturnResult(valid({ ledger })), e =>
    e instanceof ReturnGateError && e.reason === "SEND_STARTED_REQUIRED");
});

test("RETURN blocks wrong owner or work coordinate", () => {
  const r = rig();
  assert.throws(() => commitReturnResult({ ...valid(r), ownerId: "owner-B" }), /RETURN_COORDINATE_MISMATCH/);
  assert.throws(() => commitReturnResult({ ...valid(r), workId: "work-2" }), /RETURN_COORDINATE_MISMATCH/);
});

test("RETURN requires causal binding to expected user turn", () => {
  const r = rig();
  assert.throws(() => commitReturnResult({ ...valid(r), causalUserTurnId: "other-turn" }), /CAUSAL_USER_TURN_MISMATCH/);
});

test("RETURN requires a distinct new assistant turn", () => {
  const r = rig();
  assert.throws(() => commitReturnResult({ ...valid(r), assistantTurnId: "user-turn-7" }), /NEW_ASSISTANT_TURN_REQUIRED/);
});

test("RETURN requires stream end, stable content, and SAME BODY", () => {
  for (const patch of [
    { streamEnded: false },
    { contentStable: false },
    { sameBody: false },
  ]) {
    const r = rig();
    assert.throws(() => commitReturnResult({ ...valid(r), ...patch }), ReturnGateError);
  }
});

test("RESULT_COMMITTED is durable only after full RETURN proof", () => {
  const r = rig();
  const out = commitReturnResult(valid(r));
  assert.equal(out.state, GuardianState.RESULT_COMMITTED);
  assert.equal(out.resultCommitted, true);
  const reopened = new DurableLedger(r.ledger.file);
  const saved = reopened.get("SORA_01");
  assert.equal(saved.resultCommitted, true);
  assert.equal(saved.expectedUserTurnId, "user-turn-7");
  assert.equal(saved.assistantTurnId, "assistant-turn-8");
});

test("duplicate RESULT commit is blocked", () => {
  const r = rig();
  commitReturnResult(valid(r));
  assert.throws(() => commitReturnResult(valid(r)), /SEND_STARTED_REQUIRED/);
});
