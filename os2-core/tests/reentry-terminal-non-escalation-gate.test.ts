import test from "node:test";
import assert from "node:assert/strict";
import {
  denyReentryTerminalEscalation,
  REENTRY_TERMINAL_NON_ESCALATION_GATE_VERSION,
  type ReentryTerminalEscalationAttempt,
} from "../src/reentry-terminal-non-escalation-gate.js";
import { REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION } from "../src/reentry-recovery-terminal-observation-guard.js";

const resolved = {
  status: "TERMINAL_RESOLVED" as const,
  authorityKey: "auth-1",
  commitSequence: 8,
  resultId: "result-1",
  handoffId: "handoff-1",
  finalizedAt: "2026-09-12T11:02:00.000Z",
  executionDisposition: "DO_NOT_EXECUTE" as const,
  commitDisposition: "DO_NOT_COMMIT" as const,
  source: "DURABLE_RESOLUTION_RECEIPT" as const,
  guardVersion: REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
};

const unresolved = {
  status: "TERMINAL_UNRESOLVED" as const,
  reason: "RESOLUTION_RECEIPT_NOT_FOUND" as const,
  executionDisposition: "DO_NOT_EXECUTE" as const,
  commitDisposition: "DO_NOT_COMMIT" as const,
  guardVersion: REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
};

const hold = {
  status: "TERMINAL_HOLD" as const,
  reason: "RECEIPT_BACKEND_FAILURE",
  executionDisposition: "DO_NOT_EXECUTE" as const,
  commitDisposition: "DO_NOT_COMMIT" as const,
  guardVersion: REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
};

const operations: ReentryTerminalEscalationAttempt[] = [
  "CLAIM_LEASE",
  "RETRY",
  "EXECUTE",
  "COMMIT",
  "CONSUME",
  "CLOSE",
  "WRITE",
];

for (const operation of operations) {
  test(`TERMINAL_RESOLVED denies ${operation}`, () => {
    const out = denyReentryTerminalEscalation({ observation: resolved, attemptedOperation: operation });
    assert.deepEqual(out, {
      status: "DENIED",
      terminalStatus: "TERMINAL_RESOLVED",
      attemptedOperation: operation,
      reason: "TERMINAL_OBSERVATION_CANNOT_ESCALATE",
      executionDisposition: "DO_NOT_EXECUTE",
      commitDisposition: "DO_NOT_COMMIT",
      retryDisposition: "DO_NOT_RETRY",
      gateVersion: REENTRY_TERMINAL_NON_ESCALATION_GATE_VERSION,
    });
  });
}

test("TERMINAL_UNRESOLVED also denies execution escalation", () => {
  const out = denyReentryTerminalEscalation({ observation: unresolved, attemptedOperation: "EXECUTE" });
  assert.equal(out.status, "DENIED");
  if (out.status === "DENIED") assert.equal(out.terminalStatus, "TERMINAL_UNRESOLVED");
});

test("TERMINAL_HOLD also denies lease escalation", () => {
  const out = denyReentryTerminalEscalation({ observation: hold, attemptedOperation: "CLAIM_LEASE" });
  assert.equal(out.status, "DENIED");
  if (out.status === "DENIED") assert.equal(out.terminalStatus, "TERMINAL_HOLD");
});

test("forged execution disposition fails closed", () => {
  const out = denyReentryTerminalEscalation({
    observation: { ...resolved, executionDisposition: "EXECUTE" as any },
    attemptedOperation: "EXECUTE",
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "TERMINAL_OBSERVATION_PROTOCOL_FAILURE");
});

test("forged commit disposition fails closed", () => {
  const out = denyReentryTerminalEscalation({
    observation: { ...resolved, commitDisposition: "COMMIT" as any },
    attemptedOperation: "COMMIT",
  });
  assert.equal(out.status, "HOLD");
});

test("forged guard version fails closed", () => {
  const out = denyReentryTerminalEscalation({
    observation: { ...resolved, guardVersion: "EVIL" as any },
    attemptedOperation: "RETRY",
  });
  assert.equal(out.status, "HOLD");
});

test("malformed resolved authority fails closed", () => {
  const out = denyReentryTerminalEscalation({
    observation: { ...resolved, authorityKey: "" },
    attemptedOperation: "CLAIM_LEASE",
  });
  assert.equal(out.status, "HOLD");
});

test("negative commit sequence fails closed", () => {
  const out = denyReentryTerminalEscalation({
    observation: { ...resolved, commitSequence: -1 },
    attemptedOperation: "COMMIT",
  });
  assert.equal(out.status, "HOLD");
});

test("invalid finalizedAt fails closed", () => {
  const out = denyReentryTerminalEscalation({
    observation: { ...resolved, finalizedAt: "not-a-date" },
    attemptedOperation: "WRITE",
  });
  assert.equal(out.status, "HOLD");
});

test("malformed unresolved reason fails closed", () => {
  const out = denyReentryTerminalEscalation({
    observation: { ...unresolved, reason: "OTHER" as any },
    attemptedOperation: "RETRY",
  });
  assert.equal(out.status, "HOLD");
});

test("empty terminal hold reason fails closed", () => {
  const out = denyReentryTerminalEscalation({
    observation: { ...hold, reason: "" },
    attemptedOperation: "EXECUTE",
  });
  assert.equal(out.status, "HOLD");
});

test("denial output exposes no authority material", () => {
  const out = denyReentryTerminalEscalation({ observation: resolved, attemptedOperation: "COMMIT" });
  const keys = Object.keys(out);
  for (const forbidden of ["authorityKey", "commitSequence", "resultId", "handoffId", "leaseId", "receipt"]) {
    assert.equal(keys.includes(forbidden), false, `${forbidden} must not escape denial boundary`);
  }
});
