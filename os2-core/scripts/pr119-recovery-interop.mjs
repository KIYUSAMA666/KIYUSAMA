import fs from "node:fs";
import assert from "node:assert/strict";
import { recoverDurableBusRecord } from "../dist/src/ai-communication-bus-durable-state.js";

const [directPath, transitionedPath] = process.argv.slice(2);
assert.ok(directPath && transitionedPath, "expected direct and transitioned JSON fixture paths");

const direct = JSON.parse(fs.readFileSync(directPath, "utf8"));
const transitioned = JSON.parse(fs.readFileSync(transitionedPath, "utf8"));
const expectedCurrent = { stateId: "state-pr119", stateRevision: 119 };

const directRecovery = recoverDurableBusRecord(direct, expectedCurrent);
const transitionedRecovery = recoverDurableBusRecord(transitioned, expectedCurrent);

assert.equal(directRecovery.status, "RECOVERED");
assert.equal(transitionedRecovery.status, "RECOVERED");
assert.equal(directRecovery.disposition, "DELIVERY_OBSERVED");
assert.equal(transitionedRecovery.disposition, "DELIVERY_OBSERVED");

function normalize(record) {
  const clone = structuredClone(record);
  clone.message.messageId = "normalized-message";
  clone.message.traceId = "normalized-trace";
  return clone;
}

assert.deepEqual(
  normalize(directRecovery.value),
  normalize(transitionedRecovery.value),
  "direct-DELIVERED and PENDING->DELIVERED rows must recover identically",
);

console.log("RECOVERY_INTEROP=PASS");
console.log("DIRECT_DISPOSITION=" + directRecovery.disposition);
console.log("TRANSITIONED_DISPOSITION=" + transitionedRecovery.disposition);
