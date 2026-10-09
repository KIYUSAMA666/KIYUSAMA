import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DurableLedger } from "./durable-core.mjs";
import { GuardianState } from "./control-core.mjs";
import { commitSendStarted } from "./send-gate.mjs";

test("SEND gate rejects a concurrent ledger revision without authorizing SEND", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-send-cas-"));
  try {
    const ledger = new DurableLedger(path.join(dir, "ledger.json"));
    ledger.record("SORA_01", {
      state: GuardianState.LOCKED, ownerId: "owner-A", workId: "work-1",
      expectedUserTurnId: "user-turn-7", preSendCommitted: true,
      sendStarted: false, resultCommitted: false,
    });
    const lock = { read: () => ({ bodyId: "SORA_01", ownerId: "owner-A" }) };
    const originalGet = ledger.get.bind(ledger);
    let reads = 0;
    ledger.get = bodyId => {
      const entry = originalGet(bodyId);
      reads++;
      if (reads === 2) {
        ledger.record(bodyId, { ...entry, concurrentChange: true }, { expectedSeq: entry.seq });
      }
      return entry;
    };
    assert.throws(() => commitSendStarted({
      ledger, lock, bodyId: "SORA_01", ownerId: "owner-A",
      workId: "work-1", expectedUserTurnId: "user-turn-7",
    }), /LEDGER_CAS_CONFLICT/);
    const persisted = new DurableLedger(ledger.file).get("SORA_01");
    assert.equal(persisted.concurrentChange, true);
    assert.equal(persisted.sendStarted, false);
    assert.equal(persisted.state, GuardianState.LOCKED);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
