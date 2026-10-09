import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GuardianState } from "./control-core.mjs";
import { DurableLedger } from "./durable-core.mjs";
import { createGuardianReturnCapability, createEffectfulResultCommitPort } from "./return-capability.mjs";

test("CRASH GAP: external RESULT must not be repeated after ambiguous success", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-crash-"));
  try {
    const ledger = new DurableLedger(path.join(dir, "ledger.json"));
    ledger.record("SORA_01", {
      state: GuardianState.SENDING, ownerId: "owner-A", workId: "work-1",
      expectedUserTurnId: "user-turn-7", sendStarted: true, resultCommitted: false,
    });
    let externalWrites = 0;
    const port = createEffectfulResultCommitPort(async () => {
      externalWrites++;
      if (externalWrites === 1) throw new Error("SIMULATED_CRASH_AFTER_EXTERNAL_SUCCESS");
      return { ok: true };
    });
    const cap = createGuardianReturnCapability({ ledger, effectfulResultCommit: port });
    const proof = {
      bodyId: "SORA_01", ownerId: "owner-A", workId: "work-1",
      expectedUserTurnId: "user-turn-7", causalUserTurnId: "user-turn-7",
      assistantTurnId: "assistant-turn-8", streamEnded: true,
      contentStable: true, sameBody: true,
    };
    await assert.rejects(cap.commit(proof), /SIMULATED_CRASH_AFTER_EXTERNAL_SUCCESS/);
    assert.equal(ledger.get("SORA_01").externalResultPending, true);
    await assert.rejects(cap.resumePending("SORA_01"), /EXTERNAL_RESULT_AMBIGUOUS_HOLD/);
    assert.equal(externalWrites, 1, "duplicate external RESULT after ambiguous success");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
