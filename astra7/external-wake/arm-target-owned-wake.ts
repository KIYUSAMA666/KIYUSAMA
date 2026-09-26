import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  TARGET_CONVERSATION_ID,
  waitForExternalWake,
} from "./file-bus-watcher.js";

const root = resolve(process.argv[2] ?? ".astra7/external-wake");
const busFile = resolve(root, "bus.json");
const evidenceFile = resolve(root, "evidence.jsonl");
const armFile = resolve(root, "armed.json");
const expectedEventId = randomUUID();

await mkdir(dirname(armFile), { recursive: true });
await writeFile(
  armFile,
  JSON.stringify(
    {
      step: 6,
      state: "ARMED",
      expectedEventId,
      targetConversationId: TARGET_CONVERSATION_ID,
      busFile,
      evidenceFile,
      armedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

console.log(
  JSON.stringify({
    step: 6,
    state: "ARMED",
    expectedEventId,
    targetConversationId: TARGET_CONVERSATION_ID,
    armFile,
    busFile,
    evidenceFile,
  }),
);

const result = await waitForExternalWake(
  busFile,
  evidenceFile,
  30 * 60 * 1000,
  expectedEventId,
);

console.log(JSON.stringify({ step: 6, state: "SETTLED", result }));
if (result.status !== "MATCHED") process.exitCode = 2;
