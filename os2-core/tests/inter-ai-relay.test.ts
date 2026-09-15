// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { acceptInbound, createResponse, verifyRoundTrip } from "../src/inter-ai-relay.js";

const request = {
  messageId: "msg-a1",
  correlationId: "case-001",
  phase: "REQUEST",
  from: "AI-A",
  to: "AI-B",
  payload: { task: "ping" },
  evidenceRefs: ["a-send"],
};

test("cross-AI request is accepted", () => {
  assert.equal(acceptInbound(request).status, "ACCEPT");
});

test("self-route is fail-closed", () => {
  assert.deepEqual(acceptInbound({ ...request, to: "AI-A" }), {
    status: "REJECT",
    reason: "SELF_ROUTE",
  });
});

test("response preserves correlation and reverses endpoints", () => {
  const response = createResponse(request, "msg-b1", { answer: "pong" }, ["b-receive", "b-send"]);
  assert.equal(response.correlationId, request.correlationId);
  assert.equal(response.from, "AI-B");
  assert.equal(response.to, "AI-A");
  assert.equal(response.phase, "RESPONSE");
});

test("matching response verifies as a round trip candidate", () => {
  const response = createResponse(request, "msg-b1", { answer: "pong" }, ["b-receive", "b-send", "a-receive"]);
  assert.equal(verifyRoundTrip(request, response).status, "ACCEPT");
});

test("mismatched correlation is rejected", () => {
  const response = { ...createResponse(request, "msg-b1", { answer: "pong" }), correlationId: "wrong-case" };
  assert.deepEqual(verifyRoundTrip(request, response), {
    status: "REJECT",
    reason: "CORRELATION_MISMATCH",
  });
});
