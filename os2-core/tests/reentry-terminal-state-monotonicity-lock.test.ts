import test from "node:test";
import assert from "node:assert/strict";
import {
  lockReentryTerminalState,
  REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION,
} from "../src/reentry-terminal-state-monotonicity-lock.js";
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

test("exact TERMINAL_RESOLVED replay is preserved", () => {
  const out = lockReentryTerminalState({ current: resolved, proposed: { ...resolved } });
  assert.deepEqual(out, {
    status: "PRESERVED",
    terminalStatus: "TERMINAL_RESOLVED",
    transitionDisposition: "DO_NOT_TRANSITION",
    executionDisposition: "DO_NOT_EXECUTE",
    commitDisposition: "DO_NOT_COMMIT",
    retryDisposition: "DO_NOT_RETRY",
    lockVersion: REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION,
  });
});

test("exact TERMINAL_UNRESOLVED replay is preserved", () => {
  const out = lockReentryTerminalState({ current: unresolved, proposed: { ...unresolved } });
  assert.equal(out.status, "PRESERVED");
});

test("exact TERMINAL_HOLD replay is preserved", () => {
  const out = lockReentryTerminalState({ current: hold, proposed: { ...hold } });
  assert.equal(out.status, "PRESERVED");
});

for (const attemptedStatus of ["READY", "ALLOW", "RESOLVED", "COMMITTED", "ISSUED", "ALLOW_EXECUTION"]) {
  test(`terminal state cannot be reclassified to ${attemptedStatus}`, () => {
    const out = lockReentryTerminalState({
      current: resolved,
      proposed: { status: attemptedStatus },
    });
    assert.deepEqual(out, {
      status: "DENIED",
      fromStatus: "TERMINAL_RESOLVED",
      attemptedStatus,
      reason: "TERMINAL_STATE_IS_IMMUTABLE",
      transitionDisposition: "DO_NOT_TRANSITION",
      executionDisposition: "DO_NOT_EXECUTE",
      commitDisposition: "DO_NOT_COMMIT",
      retryDisposition: "DO_NOT_RETRY",
      lockVersion: REENTRY_TERMINAL_STATE_MONOTONICITY_LOCK_VERSION,
    });
  });
}

test("TERMINAL_RESOLVED cannot mutate authorityKey", () => {
  const out = lockReentryTerminalState({ current: resolved, proposed: { ...resolved, authorityKey: "auth-2" } });
  assert.equal(out.status, "DENIED");
});

test("TERMINAL_RESOLVED cannot mutate resultId", () => {
  const out = lockReentryTerminalState({ current: resolved, proposed: { ...resolved, resultId: "result-2" } });
  assert.equal(out.status, "DENIED");
});

test("TERMINAL_RESOLVED cannot mutate finalizedAt", () => {
  const out = lockReentryTerminalState({
    current: resolved,
    proposed: { ...resolved, finalizedAt: "2026-09-12T11:03:00.000Z" },
  });
  assert.equal(out.status, "DENIED");
});

test("cross-terminal reclassification is denied", () => {
  const out = lockReentryTerminalState({ current: resolved, proposed: unresolved });
  assert.equal(out.status, "DENIED");
  if (out.status === "DENIED") assert.equal(out.attemptedStatus, "TERMINAL_UNRESOLVED");
});

test("forged proposed terminal disposition fails closed", () => {
  const out = lockReentryTerminalState({
    current: resolved,
    proposed: { ...resolved, executionDisposition: "EXECUTE" },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "PROPOSED_TERMINAL_PROTOCOL_FAILURE");
});

test("forged current terminal observation fails closed", () => {
  const out = lockReentryTerminalState({
    current: { ...resolved, guardVersion: "EVIL" as any },
    proposed: resolved,
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "CURRENT_TERMINAL_PROTOCOL_FAILURE");
});

test("invalid proposed object is denied without authority material", () => {
  const out = lockReentryTerminalState({ current: resolved, proposed: null });
  assert.equal(out.status, "DENIED");
  const keys = Object.keys(out);
  for (const forbidden of ["authorityKey", "commitSequence", "resultId", "handoffId", "leaseId", "receipt"]) {
    assert.equal(keys.includes(forbidden), false, `${forbidden} must not escape transition boundary`);
  }
});
