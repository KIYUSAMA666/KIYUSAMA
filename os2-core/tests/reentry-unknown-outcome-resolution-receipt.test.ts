import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveReentryUnknownOutcomeWithDurableReceipt,
  REENTRY_UNKNOWN_OUTCOME_RESOLUTION_RECEIPT_VERSION,
  type ReentryUnknownOutcomeResolutionReceipt,
} from "../src/reentry-unknown-outcome-resolution-receipt.js";
import { REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION } from "../src/reentry-durable-unknown-outcome-record.js";

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

const record = {
  recordVersion: REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION,
  authorityKey: "auth-1",
  leaseId: "lease-1",
  actionId: "action-1",
  stateId: "state-1",
  stateRevision: 7,
  commitSequence: 8,
  resultId: "result-1",
  handoffId: "handoff-1",
  reason: "RECEIPT_NOT_FOUND" as const,
  observedAt: "2026-09-12T11:01:00.000Z",
};

const committed = {
  status: "COMMITTED" as const,
  source: "LATE_DURABLE_RECEIPT" as const,
  authorityKey: "auth-1",
  commitSequence: 8,
  committedAt: "2026-09-12T11:02:00.000Z",
};

function receipt(finalizedAt = committed.committedAt): ReentryUnknownOutcomeResolutionReceipt {
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
    unknownObservedAt: record.observedAt,
    finalizedAt,
  };
}

test("atomically closes UNKNOWN and returns exact durable resolution receipt", async () => {
  let calls = 0;
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: committed,
    lease,
    record,
    backend: {
      async closeAndWriteResolutionIfExact(input) {
        calls++;
        assert.deepEqual(input.record, record);
        assert.deepEqual(input.receipt, receipt());
        return { status: "RESOLVED" as const, receipt: input.receipt };
      },
    },
  });
  assert.equal(out.status, "RESOLVED");
  if (out.status === "RESOLVED") assert.deepEqual(out.receipt, receipt());
  assert.equal(calls, 1);
});

test("exact already-resolved receipt is idempotent", async () => {
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: committed,
    lease,
    record,
    backend: {
      async closeAndWriteResolutionIfExact() {
        return { status: "ALREADY_RESOLVED" as const, receipt: receipt() };
      },
    },
  });
  assert.equal(out.status, "RESOLVED");
});

test("non-COMMITTED decision fails before backend", async () => {
  let calls = 0;
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: { status: "UNKNOWN_OUTCOME" }, lease, record,
    backend: { async closeAndWriteResolutionIfExact() { calls++; throw new Error("must not call"); } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "FINAL_DECISION_NOT_COMMITTED");
  assert.equal(calls, 0);
});

test("PRIMARY_RPC decision cannot close durable UNKNOWN", async () => {
  let calls = 0;
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: { ...committed, source: "PRIMARY_RPC" }, lease, record,
    backend: { async closeAndWriteResolutionIfExact() { calls++; throw new Error("must not call"); } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "FINAL_DECISION_SOURCE_NOT_LATE_RECEIPT");
  assert.equal(calls, 0);
});

test("forged final decision fails before backend", async () => {
  let calls = 0;
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: { ...committed, authorityKey: "evil" }, lease, record,
    backend: { async closeAndWriteResolutionIfExact() { calls++; throw new Error("must not call"); } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "FINAL_DECISION_BINDING_MISMATCH");
  assert.equal(calls, 0);
});

test("malformed UNKNOWN record fails before backend", async () => {
  let calls = 0;
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: committed, lease, record: { ...record, stateRevision: "7" as any },
    backend: { async closeAndWriteResolutionIfExact() { calls++; throw new Error("must not call"); } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "UNKNOWN_RECORD_PROTOCOL_FAILURE");
  assert.equal(calls, 0);
});

test("UNKNOWN record from another lease fails before backend", async () => {
  let calls = 0;
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: committed, lease, record: { ...record, actionId: "other-action" },
    backend: { async closeAndWriteResolutionIfExact() { calls++; throw new Error("must not call"); } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "UNKNOWN_RECORD_BINDING_MISMATCH");
  assert.equal(calls, 0);
});

test("backend failure fails closed", async () => {
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: committed, lease, record,
    backend: { async closeAndWriteResolutionIfExact() { throw new Error("db down"); } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "BACKEND_FAILURE");
});

test("missing UNKNOWN record fails closed", async () => {
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: committed, lease, record,
    backend: { async closeAndWriteResolutionIfExact() { return { status: "NOT_FOUND" as const }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "UNKNOWN_RECORD_NOT_FOUND");
});

test("backend binding mismatch fails closed", async () => {
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: committed, lease, record,
    backend: { async closeAndWriteResolutionIfExact() { return { status: "BINDING_MISMATCH" as const }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "BACKEND_BINDING_MISMATCH");
});

test("malformed durable resolution receipt is rejected", async () => {
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: committed, lease, record,
    backend: { async closeAndWriteResolutionIfExact() { return { status: "RESOLVED" as const, receipt: { ...receipt(), stateRevision: "7" as any } }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_PROTOCOL_FAILURE");
});

test("forged durable resolution receipt is rejected", async () => {
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: committed, lease, record,
    backend: { async closeAndWriteResolutionIfExact() { return { status: "RESOLVED" as const, receipt: { ...receipt(), resultId: "evil" } }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_BINDING_MISMATCH");
});

test("already-resolved receipt with different finalizedAt is rejected", async () => {
  const out = await resolveReentryUnknownOutcomeWithDurableReceipt({
    finalDecision: committed, lease, record,
    backend: { async closeAndWriteResolutionIfExact() { return { status: "ALREADY_RESOLVED" as const, receipt: receipt("2026-09-12T11:03:00.000Z") }; } },
  });
  assert.equal(out.status, "HOLD");
  if (out.status === "HOLD") assert.equal(out.reason, "RECEIPT_BINDING_MISMATCH");
});
