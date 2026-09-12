import test from "node:test";
import assert from "node:assert/strict";
import {
  toReentryRecoveryTerminalObservation,
  REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
} from "../src/reentry-recovery-terminal-observation-guard.js";

const resolved = {
  status: "RESOLVED" as const,
  source: "DURABLE_RESOLUTION_RECEIPT" as const,
  authorityKey: "auth-1",
  commitSequence: 8,
  resultId: "result-1",
  handoffId: "handoff-1",
  finalizedAt: "2026-09-12T11:02:00.000Z",
  receipt: {
    receiptVersion: "OS2_REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_V01" as const,
    authorityKey: "auth-1",
    leaseId: "lease-1",
    actionId: "action-1",
    stateId: "state-1",
    stateRevision: 7,
    commitSequence: 8,
    resultId: "result-1",
    handoffId: "handoff-1",
    unknownObservedAt: "2026-09-12T11:01:00.000Z",
    finalizedAt: "2026-09-12T11:02:00.000Z",
  },
  recoveryVersion: "OS2_REENTRY_RESOLUTION_RECEIPT_RECOVERY_V01" as const,
};

test("resolved recovery becomes terminal observation only", () => {
  const out = toReentryRecoveryTerminalObservation(resolved);
  assert.deepEqual(out, {
    status: "TERMINAL_RESOLVED",
    authorityKey: "auth-1",
    commitSequence: 8,
    resultId: "result-1",
    handoffId: "handoff-1",
    finalizedAt: "2026-09-12T11:02:00.000Z",
    executionDisposition: "DO_NOT_EXECUTE",
    commitDisposition: "DO_NOT_COMMIT",
    source: "DURABLE_RESOLUTION_RECEIPT",
    guardVersion: REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
  });
  assert.equal("lease" in out, false);
  assert.equal("request" in out, false);
  assert.equal("execute" in out, false);
  assert.equal("commit" in out, false);
});

test("missing receipt remains terminal unresolved and cannot execute", () => {
  const out = toReentryRecoveryTerminalObservation({
    status: "UNRESOLVED",
    reason: "RESOLUTION_RECEIPT_NOT_FOUND",
    retryDisposition: "DO_NOT_COMMIT",
  });
  assert.deepEqual(out, {
    status: "TERMINAL_UNRESOLVED",
    reason: "RESOLUTION_RECEIPT_NOT_FOUND",
    executionDisposition: "DO_NOT_EXECUTE",
    commitDisposition: "DO_NOT_COMMIT",
    guardVersion: REENTRY_RECOVERY_TERMINAL_OBSERVATION_GUARD_VERSION,
  });
});

test("backend failure remains terminal hold", () => {
  const out = toReentryRecoveryTerminalObservation({
    status: "HOLD",
    stage: "RESOLUTION_RECEIPT_RECOVERY",
    reason: "RECEIPT_BACKEND_FAILURE",
    retryDisposition: "DO_NOT_COMMIT",
  });
  assert.equal(out.status, "TERMINAL_HOLD");
  assert.equal(out.executionDisposition, "DO_NOT_EXECUTE");
  assert.equal(out.commitDisposition, "DO_NOT_COMMIT");
  if (out.status === "TERMINAL_HOLD") assert.equal(out.reason, "RECEIPT_BACKEND_FAILURE");
});

test("binding mismatch remains terminal hold", () => {
  const out = toReentryRecoveryTerminalObservation({
    status: "HOLD",
    stage: "RESOLUTION_RECEIPT_RECOVERY",
    reason: "RECEIPT_BINDING_MISMATCH",
    retryDisposition: "DO_NOT_COMMIT",
  });
  assert.equal(out.status, "TERMINAL_HOLD");
  if (out.status === "TERMINAL_HOLD") assert.equal(out.reason, "RECEIPT_BINDING_MISMATCH");
});

test("forged resolved source is rejected", () => {
  const out = toReentryRecoveryTerminalObservation({ ...resolved, source: "EVIL" as any });
  assert.equal(out.status, "TERMINAL_HOLD");
  if (out.status === "TERMINAL_HOLD") assert.equal(out.reason, "RECOVERY_DECISION_PROTOCOL_FAILURE");
});

test("empty authority key is rejected", () => {
  const out = toReentryRecoveryTerminalObservation({ ...resolved, authorityKey: "" });
  assert.equal(out.status, "TERMINAL_HOLD");
  if (out.status === "TERMINAL_HOLD") assert.equal(out.reason, "RECOVERY_DECISION_PROTOCOL_FAILURE");
});

test("negative commit sequence is rejected", () => {
  const out = toReentryRecoveryTerminalObservation({ ...resolved, commitSequence: -1 });
  assert.equal(out.status, "TERMINAL_HOLD");
  if (out.status === "TERMINAL_HOLD") assert.equal(out.reason, "RECOVERY_DECISION_PROTOCOL_FAILURE");
});

test("empty result id is rejected", () => {
  const out = toReentryRecoveryTerminalObservation({ ...resolved, resultId: "" });
  assert.equal(out.status, "TERMINAL_HOLD");
  if (out.status === "TERMINAL_HOLD") assert.equal(out.reason, "RECOVERY_DECISION_PROTOCOL_FAILURE");
});

test("empty handoff id is rejected", () => {
  const out = toReentryRecoveryTerminalObservation({ ...resolved, handoffId: "" });
  assert.equal(out.status, "TERMINAL_HOLD");
  if (out.status === "TERMINAL_HOLD") assert.equal(out.reason, "RECOVERY_DECISION_PROTOCOL_FAILURE");
});

test("invalid finalizedAt is rejected", () => {
  const out = toReentryRecoveryTerminalObservation({ ...resolved, finalizedAt: "not-a-date" });
  assert.equal(out.status, "TERMINAL_HOLD");
  if (out.status === "TERMINAL_HOLD") assert.equal(out.reason, "RECOVERY_DECISION_PROTOCOL_FAILURE");
});

test("terminal resolved output does not expose recovered receipt object", () => {
  const out = toReentryRecoveryTerminalObservation(resolved);
  assert.equal("receipt" in out, false);
});

test("terminal unresolved has no authority identifiers", () => {
  const out = toReentryRecoveryTerminalObservation({
    status: "UNRESOLVED",
    reason: "RESOLUTION_RECEIPT_NOT_FOUND",
    retryDisposition: "DO_NOT_COMMIT",
  });
  assert.equal("authorityKey" in out, false);
  assert.equal("commitSequence" in out, false);
});
