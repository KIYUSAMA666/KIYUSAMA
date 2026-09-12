import test from "node:test";
import assert from "node:assert/strict";
import {
  recoverReentryResolutionFromDurableReceipt,
  REENTRY_RESOLUTION_RECEIPT_RECOVERY_VERSION,
} from "../src/reentry-resolution-receipt-recovery.js";
import {
  REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_VERSION,
  type ReentryUnknownOutcomeResolutionReceipt,
} from "../src/reentry-unknown-outcome-resolution-receipt.js";

const lease = {
  leaseId: "lease-1",
  authorityKey: "auth-1",
  actionId: "action-1",
  stateId: "state-1",
  stateRevision: 7,
  commitSequence: 8,
  attestationId: "att-1",
  attestationObservedAt: "2026-09-12T11:00:00.000Z",
  attestationSource: "KIRA",
  reentryAuthorityExpiresAt: "2026-09-12T11:20:00.000Z",
  issuedAt: "2026-09-12T11:00:00.000Z",
  expiresAt: "2026-09-12T11:10:00.000Z",
};

function receipt(): ReentryUnknownOutcomeResolutionReceipt {
  return {
    receiptVersion: REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_VERSION,
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
  };
}

test("fresh process recovers exact resolved authority from durable receipt only", async () => {
  let reads = 0;
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: {
      async readResolutionByAuthorityKey(authorityKey) {
        reads++;
        assert.equal(authorityKey, lease.authorityKey);
        return { status: "FOUND" as const, receipt: receipt() };
      },
    },
  });
  assert.equal(out.status, "RESOLVED");
  if (out.status === "RESOLVED") {
    assert.equal(out.source, "DURABLE_RESOLUTION_RECEIPT");
    assert.equal(out.authorityKey, "auth-1");
    assert.equal(out.commitSequence, 8);
    assert.equal(out.resultId, "result-1");
    assert.equal(out.handoffId, "handoff-1");
    assert.equal(out.recoveryVersion, REENTRY_RESOLUTION_RECEIPT_RECOVERY_VERSION);
    assert.deepEqual(out.receipt, receipt());
  }
  assert.equal(reads, 1);
});

test("receipt snapshot is detached from backend object", async () => {
  const stored = receipt();
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "FOUND" as const, receipt: stored }; } },
  });
  assert.equal(out.status, "RESOLVED");
  if (out.status === "RESOLVED") {
    stored.resultId = "mutated-after-read";
    assert.equal(out.receipt.resultId, "result-1");
  }
});

test("missing resolution receipt never implies permission to commit", async () => {
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "NOT_FOUND" as const }; } },
  });
  assert.deepEqual(out, {
    status: "UNRESOLVED",
    reason: "RESOLUTION_RECEIPT_NOT_FOUND",
    retryDisposition: "DO_NOT_COMMIT",
  });
});

test("backend outage fails closed and never implies permission to commit", async () => {
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { throw new Error("db down"); } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") {
    assert.equal(out.reason, "RECEIPT_BACKEND_FAILURE");
    assert.equal(out.retryDisposition, "DO_NOT_COMMIT");
  }
});

test("backend binding mismatch fails closed", async () => {
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "BINDING_MISMATCH" as const }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_BACKEND_BINDING_MISMATCH");
});

test("malformed receipt version is rejected", async () => {
  const bad = { ...receipt(), receiptVersion: "EVIL" as any };
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "FOUND" as const, receipt: bad }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_PROTOCOL_FAILURE");
});

test("malformed state revision is rejected", async () => {
  const bad = { ...receipt(), stateRevision: "7" as any };
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "FOUND" as const, receipt: bad }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_PROTOCOL_FAILURE");
});

test("negative commit sequence is rejected as malformed", async () => {
  const bad = { ...receipt(), commitSequence: -1 };
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "FOUND" as const, receipt: bad }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_PROTOCOL_FAILURE");
});

test("finalizedAt before unknownObservedAt is rejected", async () => {
  const bad = { ...receipt(), finalizedAt: "2026-09-12T10:59:00.000Z" };
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "FOUND" as const, receipt: bad }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_PROTOCOL_FAILURE");
});

test("receipt for another authority is rejected", async () => {
  const forged = { ...receipt(), authorityKey: "evil" };
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "FOUND" as const, receipt: forged }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_BINDING_MISMATCH");
});

test("receipt for another lease is rejected", async () => {
  const forged = { ...receipt(), leaseId: "other-lease" };
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "FOUND" as const, receipt: forged }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_BINDING_MISMATCH");
});

test("receipt for another action is rejected", async () => {
  const forged = { ...receipt(), actionId: "other-action" };
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "FOUND" as const, receipt: forged }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_BINDING_MISMATCH");
});

test("receipt for another state revision is rejected", async () => {
  const forged = { ...receipt(), stateRevision: 6 };
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "FOUND" as const, receipt: forged }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_BINDING_MISMATCH");
});

test("receipt for another commit sequence is rejected", async () => {
  const forged = { ...receipt(), commitSequence: 9 };
  const out = await recoverReentryResolutionFromDurableReceipt({
    lease,
    backend: { async readResolutionByAuthorityKey() { return { status: "FOUND" as const, receipt: forged }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_BINDING_MISMATCH");
});
