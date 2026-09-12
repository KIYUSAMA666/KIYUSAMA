// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION,
  recordObservedReentryUnknownOutcome,
  resumeObservedReentryUnknownOutcomeFromDurableRecord,
} from "../src/reentry-durable-unknown-outcome-record.js";
import { REENTRY_COMMIT_RECEIPT_VERSION } from "../src/reentry-durable-commit-receipt.js";

const nextCurrent = {
  identity: {
    stateId: "CS-MAIN",
    stateRevision: 13,
    lineageId: "LINEAGE-1",
    schemaVersion: "0.1",
    effectiveAt: "2026-09-12T11:00:00Z",
    scope: "KIYUSAMA_OS_2",
  },
  nextActionSingle: { actionId: "NA-1", description: "next" },
  humanDecisionFinal: {
    decisionId: "HD-1",
    sourceAuthority: "KIYUSAMA",
    shortDirective: "execute",
  },
  writeBack: {
    parent: { parentStateId: "CS-MAIN", parentRevision: 12 },
    source: { sourceResultId: "RESULT-1", sourceHandoffId: "HANDOFF-1" },
  },
};

const lease = {
  leaseId: "LEASE-1",
  authorityKey: '["OS2_REENTRY_AUTHORITY_V01","NA-1","CS-MAIN",12,4,"ATT-1","2026-09-12T10:59:00.000Z","KIRA"]',
  actionId: "NA-1",
  stateId: "CS-MAIN",
  stateRevision: 12,
  commitSequence: 4,
  attestationId: "ATT-1",
  attestationObservedAt: "2026-09-12T10:59:00.000Z",
  attestationSource: "KIRA",
  reentryAuthorityExpiresAt: "2026-09-12T11:05:00.000Z",
  issuedAt: "2026-09-12T11:00:00.000Z",
  expiresAt: "2026-09-12T11:01:00.000Z",
};

const atomicCommit = {
  expectedCurrent: {
    expectedCurrentStateId: "CS-MAIN",
    expectedCurrentRevision: 12,
  },
  consumeResultId: "RESULT-1",
  consumeHandoffId: "HANDOFF-1",
  nextCurrent,
};

const previousUnknown = {
  status: "UNKNOWN_OUTCOME",
  reason: "RECEIPT_NOT_FOUND",
  authorityKey: lease.authorityKey,
  retryDisposition: "DO_NOT_RETRY",
};

function receipt(overrides = {}) {
  return {
    receiptVersion: REENTRY_COMMIT_RECEIPT_VERSION,
    authorityKey: lease.authorityKey,
    leaseId: lease.leaseId,
    actionId: lease.actionId,
    stateId: lease.stateId,
    fromRevision: 12,
    toRevision: 13,
    priorCommitSequence: 4,
    committedSequence: 5,
    resultId: "RESULT-1",
    handoffId: "HANDOFF-1",
    nextCurrent,
    committedAt: "2026-09-12T11:00:02.000Z",
    ...overrides,
  };
}

class MemoryUnknownBackend {
  records = new Map();
  writes = 0;
  reads = 0;
  throwWrite = false;
  throwRead = false;

  async writeIfAbsent(record) {
    this.writes += 1;
    if (this.throwWrite) throw new Error("record write outage");
    const existing = this.records.get(record.authorityKey);
    if (existing) return { status: "ALREADY_EXISTS", record: structuredClone(existing) };
    this.records.set(record.authorityKey, structuredClone(record));
    return { status: "STORED" };
  }

  async readByAuthorityKey(authorityKey) {
    this.reads += 1;
    if (this.throwRead) throw new Error("record read outage");
    const record = this.records.get(authorityKey);
    if (!record) return { status: "NOT_FOUND" };
    return { status: "FOUND", record: structuredClone(record) };
  }
}

function receiptBackend(decision, counter = null) {
  return {
    async readByAuthorityKey(authorityKey) {
      if (counter) counter.calls += 1;
      if (counter) counter.lastAuthorityKey = authorityKey;
      return decision;
    },
  };
}

async function store(backend, overrides = {}) {
  return recordObservedReentryUnknownOutcome({
    previousDecision: previousUnknown,
    lease,
    atomicCommit,
    observedAt: "2026-09-12T11:00:03.000Z",
    recordBackend: backend,
    ...overrides,
  });
}

test("UNKNOWN_OUTCOME is durably recorded with exact authority/result/handoff binding", async () => {
  const backend = new MemoryUnknownBackend();
  const d = await store(backend);
  assert.deepEqual(d, {
    status: "RECORDED",
    authorityKey: lease.authorityKey,
    recordVersion: REENTRY_UNKNOWN_OUTCOME_RECORD_VERSION,
  });
  const saved = backend.records.get(lease.authorityKey);
  assert.equal(saved.resultId, "RESULT-1");
  assert.equal(saved.handoffId, "HANDOFF-1");
  assert.equal(saved.reason, "RECEIPT_NOT_FOUND");
  assert.equal(backend.writes, 1);
});

test("same exact UNKNOWN record is idempotent", async () => {
  const backend = new MemoryUnknownBackend();
  assert.equal((await store(backend)).status, "RECORDED");
  assert.equal((await store(backend)).status, "RECORDED");
  assert.equal(backend.records.size, 1);
  assert.equal(backend.writes, 2);
});

test("conflicting second record for same authority fails closed", async () => {
  const backend = new MemoryUnknownBackend();
  assert.equal((await store(backend)).status, "RECORDED");
  const d = await store(backend, {
    previousDecision: { ...previousUnknown, reason: "RECEIPT_BACKEND_FAILURE" },
  });
  assert.deepEqual(d, {
    status: "HOLD",
    stage: "UNKNOWN_OUTCOME_RECORD",
    reason: "RECORD_BINDING_MISMATCH",
    retryDisposition: "DO_NOT_RETRY",
  });
});

test("non-UNKNOWN decision is rejected before record backend write", async () => {
  const backend = new MemoryUnknownBackend();
  const d = await store(backend, {
    previousDecision: {
      status: "COMMITTED",
      source: "PRIMARY_RPC",
      commitSequence: 5,
      authorityKey: lease.authorityKey,
    },
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "PRIOR_DECISION_NOT_UNKNOWN");
  assert.equal(backend.writes, 0);
});

test("UNKNOWN for another authority is rejected before record backend write", async () => {
  const backend = new MemoryUnknownBackend();
  const d = await store(backend, {
    previousDecision: { ...previousUnknown, authorityKey: "OTHER" },
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "PRIOR_UNKNOWN_BINDING_MISMATCH");
  assert.equal(backend.writes, 0);
});

test("invalid observation time is rejected before durable write", async () => {
  const backend = new MemoryUnknownBackend();
  const d = await store(backend, { observedAt: "not-a-date" });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "INVALID_OBSERVED_AT");
  assert.equal(backend.writes, 0);
});

test("atomic binding mismatch is rejected before durable write", async () => {
  const backend = new MemoryUnknownBackend();
  const d = await store(backend, {
    atomicCommit: {
      ...atomicCommit,
      expectedCurrent: { ...atomicCommit.expectedCurrent, expectedCurrentRevision: 999 },
    },
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "RECORD_BINDING_MISMATCH");
  assert.equal(backend.writes, 0);
});

test("record backend failure fails closed and still forbids retry", async () => {
  const backend = new MemoryUnknownBackend();
  backend.throwWrite = true;
  const d = await store(backend);
  assert.deepEqual(d, {
    status: "HOLD",
    stage: "UNKNOWN_OUTCOME_RECORD",
    reason: "RECORD_BACKEND_FAILURE",
    retryDisposition: "DO_NOT_RETRY",
  });
});

test("after restart durable UNKNOWN plus exact receipt converges to COMMITTED without commit API", async () => {
  const backend = new MemoryUnknownBackend();
  assert.equal((await store(backend)).status, "RECORDED");
  const counter = { calls: 0, lastAuthorityKey: null };
  const d = await resumeObservedReentryUnknownOutcomeFromDurableRecord({
    lease,
    atomicCommit,
    recordBackend: backend,
    receiptBackend: receiptBackend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.deepEqual(d, {
    status: "COMMITTED",
    source: "LATE_DURABLE_RECEIPT",
    commitSequence: 5,
    authorityKey: lease.authorityKey,
    committedAt: "2026-09-12T11:00:02.000Z",
  });
  assert.equal(counter.calls, 1);
});

test("durable UNKNOWN plus still-missing receipt remains UNKNOWN and DO_NOT_RETRY", async () => {
  const backend = new MemoryUnknownBackend();
  assert.equal((await store(backend)).status, "RECORDED");
  const d = await resumeObservedReentryUnknownOutcomeFromDurableRecord({
    lease,
    atomicCommit,
    recordBackend: backend,
    receiptBackend: receiptBackend({ status: "NOT_FOUND" }),
  });
  assert.deepEqual(d, {
    status: "UNKNOWN_OUTCOME",
    reason: "RECEIPT_NOT_FOUND",
    authorityKey: lease.authorityKey,
    retryDisposition: "DO_NOT_RETRY",
  });
});

test("missing durable UNKNOWN record blocks receipt lookup", async () => {
  const backend = new MemoryUnknownBackend();
  const counter = { calls: 0 };
  const d = await resumeObservedReentryUnknownOutcomeFromDurableRecord({
    lease,
    atomicCommit,
    recordBackend: backend,
    receiptBackend: receiptBackend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "UNKNOWN_RECORD_NOT_FOUND");
  assert.equal(counter.calls, 0);
});

test("forged durable UNKNOWN binding blocks receipt lookup", async () => {
  const backend = new MemoryUnknownBackend();
  assert.equal((await store(backend)).status, "RECORDED");
  const saved = backend.records.get(lease.authorityKey);
  backend.records.set(lease.authorityKey, { ...saved, resultId: "FORGED-RESULT" });
  const counter = { calls: 0 };
  const d = await resumeObservedReentryUnknownOutcomeFromDurableRecord({
    lease,
    atomicCommit,
    recordBackend: backend,
    receiptBackend: receiptBackend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "UNKNOWN_RECORD_BINDING_MISMATCH");
  assert.equal(counter.calls, 0);
});

test("malformed durable UNKNOWN record blocks receipt lookup", async () => {
  const backend = new MemoryUnknownBackend();
  assert.equal((await store(backend)).status, "RECORDED");
  const saved = backend.records.get(lease.authorityKey);
  backend.records.set(lease.authorityKey, { ...saved, observedAt: "broken-date" });
  const counter = { calls: 0 };
  const d = await resumeObservedReentryUnknownOutcomeFromDurableRecord({
    lease,
    atomicCommit,
    recordBackend: backend,
    receiptBackend: receiptBackend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "UNKNOWN_RECORD_PROTOCOL_FAILURE");
  assert.equal(counter.calls, 0);
});

test("durable record backend read failure blocks receipt lookup", async () => {
  const backend = new MemoryUnknownBackend();
  backend.throwRead = true;
  const counter = { calls: 0 };
  const d = await resumeObservedReentryUnknownOutcomeFromDurableRecord({
    lease,
    atomicCommit,
    recordBackend: backend,
    receiptBackend: receiptBackend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "UNKNOWN_RECORD_BACKEND_FAILURE");
  assert.equal(counter.calls, 0);
});
