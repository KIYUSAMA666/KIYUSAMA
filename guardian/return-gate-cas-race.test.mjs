import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DurableLedger } from "./durable-core.mjs";
import { GuardianState } from "./control-core.mjs";
import { commitReturnResult } from "./return-gate.mjs";

test("RETURN gate rejects stale concurrent ledger revision", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-return-cas-"));
  try {
    const ledger = new DurableLedger(path.join(dir, "ledger.json"));
    ledger.record("SORA_01", {
      state: GuardianState.SENDING, ownerId: "owner-A", workId: "work-1",
      expectedUserTurnId: "user-turn-7", sendStarted: true, resultCommitted: false,
    });
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
    assert.throws(() => commitReturnResult({
      ledger, bodyId: "SORA_01", ownerId: "owner-A", workId: "work-1",
      expectedUserTurnId: "user-turn-7", causalUserTurnId: "user-turn-7",
      assistantTurnId: "assistant-turn-8", streamEnded: true,
      contentStable: true, sameBody: true,
    }), /LEDGER_CAS_CONFLICT/);
    const persisted = new DurableLedger(ledger.file).get("SORA_01");
    assert.equal(persisted.concurrentChange, true);
    assert.equal(persisted.resultCommitted, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
