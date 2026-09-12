// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  finalizeObservedReentryUnknownOutcome,
} from "../src/reentry-late-receipt-finalization.js";
import { REENTRY_COMMIT_RECEIPT_VERSION } from "../src/reentry-durable-commit-receipt.js";

const nextCurrent = {
  identity: {
    stateId: "CS-MAIN",
    stateRevision: 13,
    lineageId: "LINEAGE-1",
    schemaVersion: "0.1",
    effectiveAt: "2026-09-12T09:00:00Z",
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
  authorityKey: '["OS2_REENTRY_AUTHORITY_V01","NA-1","CS-MAIN",12,4,"ATT-1","2026-09-12T08:59:00.000Z","KIRA"]',
  actionId: "NA-1",
  stateId: "CS-MAIN",
  stateRevision: 12,
  commitSequence: 4,
  attestationId: "ATT-1",
  attestationObservedAt: "2026-09-12T08:59:00.000Z",
  attestationSource: "KIRA",
  reentryAuthorityExpiresAt: "2026-09-12T09:05:00.000Z",
  issuedAt: "2026-09-12T09:00:00.000Z",
  expiresAt: "2026-09-12T09:01:00.000Z",
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
    committedAt: "2026-09-12T09:00:02.000Z",
    ...overrides,
  };
}

function backend(decision, counter = null) {
  return {
    async readByAuthorityKey(authorityKey) {
      if (counter) counter.calls += 1;
      if (counter) counter.lastAuthorityKey = authorityKey;
      return decision;
    },
  };
}

test("late exact receipt converges UNKNOWN_OUTCOME to COMMITTED without any commit API", async () => {
  const counter = { calls: 0, lastAuthorityKey: null };
  const d = await finalizeObservedReentryUnknownOutcome({
    previousDecision: previousUnknown,
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.deepEqual(d, {
    status: "COMMITTED",
    source: "LATE_DURABLE_RECEIPT",
    commitSequence: 5,
    authorityKey: lease.authorityKey,
    committedAt: "2026-09-12T09:00:02.000Z",
  });
  assert.equal(counter.calls, 1);
  assert.equal(counter.lastAuthorityKey, lease.authorityKey);
});

test("receipt still missing remains UNKNOWN_OUTCOME and DO_NOT_RETRY", async () => {
  const d = await finalizeObservedReentryUnknownOutcome({
    previousDecision: previousUnknown,
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "NOT_FOUND" }),
  });
  assert.deepEqual(d, {
    status: "UNKNOWN_OUTCOME",
    reason: "RECEIPT_NOT_FOUND",
    authorityKey: lease.authorityKey,
    retryDisposition: "DO_NOT_RETRY",
  });
});

test("receipt backend outage remains UNKNOWN_OUTCOME and DO_NOT_RETRY", async () => {
  const d = await finalizeObservedReentryUnknownOutcome({
    previousDecision: {
      ...previousUnknown,
      reason: "RECEIPT_BACKEND_FAILURE",
    },
    lease,
    atomicCommit,
    receiptBackend: {
      async readByAuthorityKey() {
        throw new Error("temporary receipt outage");
      },
    },
  });
  assert.deepEqual(d, {
    status: "UNKNOWN_OUTCOME",
    reason: "RECEIPT_BACKEND_FAILURE",
    authorityKey: lease.authorityKey,
    retryDisposition: "DO_NOT_RETRY",
  });
});

test("a later exact receipt can resolve an earlier RECEIPT_BACKEND_FAILURE", async () => {
  const d = await finalizeObservedReentryUnknownOutcome({
    previousDecision: {
      ...previousUnknown,
      reason: "RECEIPT_BACKEND_FAILURE",
    },
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "COMMITTED", receipt: receipt() }),
  });
  assert.equal(d.status, "COMMITTED");
  assert.equal(d.source, "LATE_DURABLE_RECEIPT");
  assert.equal(d.commitSequence, 5);
});

test("forged or mismatched late receipt becomes HOLD and never authorizes retry", async () => {
  const d = await finalizeObservedReentryUnknownOutcome({
    previousDecision: previousUnknown,
    lease,
    atomicCommit,
    receiptBackend: backend({
      status: "COMMITTED",
      receipt: receipt({ committedSequence: 999 }),
    }),
  });
  assert.deepEqual(d, {
    status: "HOLD",
    stage: "OUTCOME_FINALIZATION",
    reason: "RECEIPT_BINDING_MISMATCH",
    retryDisposition: "DO_NOT_RETRY",
  });
});

test("malformed late receipt becomes protocol HOLD", async () => {
  const d = await finalizeObservedReentryUnknownOutcome({
    previousDecision: previousUnknown,
    lease,
    atomicCommit,
    receiptBackend: backend({
      status: "COMMITTED",
      receipt: receipt({ committedAt: "not-a-date" }),
    }),
  });
  assert.deepEqual(d, {
    status: "HOLD",
    stage: "OUTCOME_FINALIZATION",
    reason: "RECEIPT_PROTOCOL_FAILURE",
    retryDisposition: "DO_NOT_RETRY",
  });
});

test("UNKNOWN_OUTCOME for a different authority is rejected before receipt read", async () => {
  const counter = { calls: 0 };
  const d = await finalizeObservedReentryUnknownOutcome({
    previousDecision: {
      ...previousUnknown,
      authorityKey: "OTHER-AUTHORITY",
    },
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.deepEqual(d, {
    status: "HOLD",
    stage: "OUTCOME_FINALIZATION",
    reason: "PRIOR_UNKNOWN_BINDING_MISMATCH",
    retryDisposition: "DO_NOT_RETRY",
  });
  assert.equal(counter.calls, 0);
});

test("already-final or non-UNKNOWN decision cannot enter late finalization", async () => {
  const counter = { calls: 0 };
  const d = await finalizeObservedReentryUnknownOutcome({
    previousDecision: {
      status: "COMMITTED",
      source: "PRIMARY_RPC",
      commitSequence: 5,
      authorityKey: lease.authorityKey,
    },
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.deepEqual(d, {
    status: "HOLD",
    stage: "OUTCOME_FINALIZATION",
    reason: "PRIOR_DECISION_NOT_UNKNOWN",
    retryDisposition: "DO_NOT_RETRY",
  });
  assert.equal(counter.calls, 0);
});
