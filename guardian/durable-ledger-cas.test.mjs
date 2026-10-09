import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DurableLedger } from "./durable-core.mjs";

test("stale revision cannot overwrite durable RESULT attempt marker", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-ledger-cas-"));
  try {
    const ledger = new DurableLedger(path.join(dir, "ledger.json"));
    const initial = ledger.record("SORA_01", {
      state: "RESULT_COMMITTED", externalResultPending: true,
      externalResultAttempted: false,
    });
    const attempted = ledger.record("SORA_01", {
      ...initial, externalResultAttempted: true,
    }, { expectedSeq: initial.seq });
    assert.equal(attempted.externalResultAttempted, true);
    assert.throws(() => ledger.record("SORA_01", {
      ...initial, externalResultAttempted: false,
    }, { expectedSeq: initial.seq }), /LEDGER_CAS_CONFLICT/);
    assert.throws(() => ledger.record("SORA_01", {
      ...initial, externalResultAttempted: false,
    }), /LEDGER_ATTEMPT_MARKER_REGRESSION/);
    const saved = new DurableLedger(ledger.file).get("SORA_01");
    assert.equal(saved.seq, attempted.seq);
    assert.equal(saved.externalResultAttempted, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
