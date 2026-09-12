import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeFinalizedReentryUnknownOutcomeRecord,
  REENTRY_UNKNOWN_OUTCOME_RECORD_CONSUME_VERSION,
} from "../src/reentry-unknown-outcome-record-consume.js";
import { REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION } from "../src/reentry-durable-unknown-outcome-record.js";

const lease = {
  leaseVersion: "OS2_REENTRY_AUTHORITY_LEASE_V01" as const,
  leaseId: "lease-1", authorityKey: "auth-1", actionId: "action-1", stateId: "state-1",
  stateRevision: 7, commitSequence: 8, issuedAt: "2026-09-12T11:00:00.000Z",
  expiresAt: "2026-09-12T11:10:00.000Z",
};
const record = {
  recordVersion: REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION,
  authorityKey: "auth-1", leaseId: "lease-1", actionId: "action-1", stateId: "state-1",
  stateRevision: 7, commitSequence: 8, resultId: "result-1", handoffId: "handoff-1",
  reason: "RECEIPT_NOT_FOUND" as const, observedAt: "2026-09-12T11:01:00.000Z",
};
const committed = {
  status: "COMMITTED" as const, source: "LATE_DURABLE_RECEIPT" as const,
  authorityKey: "auth-1", commitSequence: 8, committedAt: "2026-09-12T11:02:00.000Z",
};

test("exact late-receipt finalization consumes durable UNKNOWN record", async () => {
  let calls = 0;
  const out = await consumeFinalizedReentryUnknownOutcomeRecord({ finalDecision: committed, lease, record, backend: {
    async consumeIfExact(input) { calls++; assert.equal(input.resultId, "result-1"); assert.equal(input.finalizedAt, committed.committedAt); return { status: "CONSUMED" as const }; }
  }});
  assert.deepEqual(out, { status: "CONSUMED", authorityKey: "auth-1", consumeVersion: REENTRY_UNKNOWN_OUTCOME_RECORD_CONSUME_VERSION });
  assert.equal(calls, 1);
});

test("same finalization is idempotent when already consumed at exact time", async () => {
  const out = await consumeFinalizedReentryUnknownOutcomeRecord({ finalDecision: committed, lease, record, backend: {
    async consumeIfExact() { return { status: "ALREADY_CONSUMED" as const, finalizedAt: committed.committedAt }; }
  }});
  assert.equal(out.status, "CONSUMED");
});

test("different already-consumed finalization time fails closed", async () => {
  const out = await consumeFinalizedReentryUnknownOutcomeRecord({ finalDecision: committed, lease, record, backend: {
    async consumeIfExact() { return { status: "ALREADY_CONSUMED" as const, finalizedAt: "2026-09-12T11:03:00.000Z" }; }
  }});
  assert.deepEqual(out, { status: "HOLD", stage: "UNKNOWN_OUTCOME_RECORD_CONSUME", reason: "RECORD_PROTOCOL_FAILURE", retryDisposition: "DO_NOT_RETRY" });
});

test("non-COMMITTED decision never touches backend", async () => {
  let calls = 0;
  const out = await consumeFinalizedReentryUnknownOutcomeRecord({ finalDecision: { status: "UNKNOWN_OUTCOME" }, lease, record, backend: {
    async consumeIfExact() { calls++; throw new Error("must not call"); }
  }});
  assert.equal(out.status, "HOLD"); assert.equal((out as any).reason, "FINAL_DECISION_NOT_COMMITTED"); assert.equal(calls, 0);
});

test("PRIMARY_RPC committed decision cannot consume UNKNOWN record", async () => {
  let calls = 0;
  const out = await consumeFinalizedReentryUnknownOutcomeRecord({ finalDecision: { ...committed, source: "PRIMARY_RPC" }, lease, record, backend: {
    async consumeIfExact() { calls++; throw new Error("must not call"); }
  }});
  assert.equal(out.status, "HOLD"); assert.equal((out as any).reason, "FINAL_DECISION_SOURCE_NOT_LATE_RECEIPT"); assert.equal(calls, 0);
});

test("forged final decision binding never touches backend", async () => {
  let calls = 0;
  const out = await consumeFinalizedReentryUnknownOutcomeRecord({ finalDecision: { ...committed, authorityKey: "evil" }, lease, record, backend: {
    async consumeIfExact() { calls++; throw new Error("must not call"); }
  }});
  assert.equal(out.status, "HOLD"); assert.equal((out as any).reason, "FINAL_DECISION_BINDING_MISMATCH"); assert.equal(calls, 0);
});

test("forged durable record never touches backend", async () => {
  let calls = 0;
  const out = await consumeFinalizedReentryUnknownOutcomeRecord({ finalDecision: committed, lease, record: { ...record, resultId: "evil" }, backend: {
    async consumeIfExact(input) { calls++; assert.equal(input.resultId, "evil"); return { status: "BINDING_MISMATCH" as const }; }
  }});
  assert.equal(out.status, "HOLD"); assert.equal((out as any).reason, "RECORD_BINDING_MISMATCH"); assert.equal(calls, 1);
});

test("malformed durable record fails before backend", async () => {
  let calls = 0;
  const bad = { ...record, stateRevision: "7" as any };
  const out = await consumeFinalizedReentryUnknownOutcomeRecord({ finalDecision: committed, lease, record: bad, backend: {
    async consumeIfExact() { calls++; throw new Error("must not call"); }
  }});
  assert.equal(out.status, "HOLD"); assert.equal((out as any).reason, "UNKNOWN_RECORD_PROTOCOL_FAILURE"); assert.equal(calls, 0);
});

test("backend failure fails closed", async () => {
  const out = await consumeFinalizedReentryUnknownOutcomeRecord({ finalDecision: committed, lease, record, backend: {
    async consumeIfExact() { throw new Error("db down"); }
  }});
  assert.equal(out.status, "HOLD"); assert.equal((out as any).reason, "RECORD_BACKEND_FAILURE");
});

test("missing record fails closed", async () => {
  const out = await consumeFinalizedReentryUnknownOutcomeRecord({ finalDecision: committed, lease, record, backend: {
    async consumeIfExact() { return { status: "NOT_FOUND" as const }; }
  }});
  assert.equal(out.status, "HOLD"); assert.equal((out as any).reason, "RECORD_NOT_FOUND");
});
