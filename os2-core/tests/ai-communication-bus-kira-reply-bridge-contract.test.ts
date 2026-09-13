import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/ai-communication-bus-kira-reply-bridge.ts"),
  "utf8",
);

test("bridge reuses createBusReply and PR117 round-trip verifier", () => {
  assert.match(source, /createBusReply\(input\.request, reply\)/);
  assert.match(source, /verifyBusRoundTripEvidence\(/);
});

test("executor reply_message_id must bind exact genuine reply row", () => {
  assert.match(source, /trace\.reply_message_id/);
  assert.match(source, /executorReplyId !== input\.genuineReply\.messageId/);
});

test("reply transport evidence is built from the verified genuine reply identity", () => {
  assert.match(source, /messageId: replyDecision\.value\.messageId/);
  assert.match(source, /traceId: replyDecision\.value\.traceId/);
  assert.match(source, /targetAgentId: replyDecision\.value\.targetAgentId/);
  assert.match(source, /status: "DELIVERED"/);
});
