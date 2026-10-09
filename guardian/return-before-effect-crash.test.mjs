import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GuardianState } from "./control-core.mjs";
import { DurableLedger } from "./durable-core.mjs";
import { createGuardianReturnCapability, createEffectfulResultCommitPort } from "./return-capability.mjs";

test("crash before external effect stays HOLD, not blind replay", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-before-effect-"));
  try {
    const file = path.join(dir, "ledger.json");
    const ledger = new DurableLedger(file);
    ledger.record("SORA_01", {
      state: GuardianState.RESULT_COMMITTED, ownerId: "owner-A", workId: "work-1",
      expectedUserTurnId: "user-turn-7", assistantTurnId: "assistant-turn-8",
      sendStarted: true, resultCommitted: true, externalResultPending: true,
      externalResultAttempted: true,
    });
    let externalWrites = 0;
    const capability = createGuardianReturnCapability({
      ledger: new DurableLedger(file),
      effectfulResultCommit: createEffectfulResultCommitPort(async () => { externalWrites++; }),
    });
    await assert.rejects(capability.resumePending("SORA_01"), /EXTERNAL_RESULT_AMBIGUOUS_HOLD/);
    assert.equal(externalWrites, 0);
    assert.equal(new DurableLedger(file).get("SORA_01").externalResultPending, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
