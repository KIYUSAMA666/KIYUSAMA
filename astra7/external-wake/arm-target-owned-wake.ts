import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  TARGET_CONVERSATION_ID,
  waitForExternalWake,
} from "./file-bus-watcher.js";

const root = resolve(process.argv[2] ?? ".astra7/external-wake");
const timeoutMs = Number(process.env.ASTRA7_WAKE_TIMEOUT_MS ?? 90_000);
if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
  throw new Error("ASTRA7_WAKE_TIMEOUT_MS must be between 1000 and 300000");
}

const busFile = resolve(root, "bus.json");
const evidenceFile = resolve(root, "evidence.jsonl");
const armFile = resolve(root, "armed.json");
const expectedEventId = randomUUID();

await mkdir(dirname(armFile), { recursive: true });
await writeFile(
  armFile,
  JSON.stringify({
    step: 6,
    state: "ARMED",
    owner: "TARGET_TOP_LEVEL_SESSION",
    expectedEventId,
    targetConversationId: TARGET_CONVERSATION_ID,
    busFile,
    evidenceFile,
    timeoutMs,
    armedAt: new Date().toISOString(),
  }, null, 2) + "\n",
  "utf8",
);

console.log(JSON.stringify({
  step: 6,
  state: "ARMED",
  owner: "TARGET_TOP_LEVEL_SESSION",
  expectedEventId,
  targetConversationId: TARGET_CONVERSATION_ID,
  timeoutMs,
  armFile,
  busFile,
  evidenceFile,
}));

const result = await waitForExternalWake(
  busFile,
  evidenceFile,
  timeoutMs,
  expectedEventId,
);

console.log(JSON.stringify({ step: 6, state: "SETTLED", result }));
if (result.status !== "MATCHED") process.exitCode = 2;
