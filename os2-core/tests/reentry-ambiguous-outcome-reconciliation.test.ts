// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileObservedReentryAtomicCommitOutcome,
} from "../src/reentry-ambiguous-outcome-reconciliation.js";
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

const committedPrimary = {
  status: "COMMITTED",
  commitSequence: 5,
  authorityKey: lease.authorityKey,
};
const ambiguousPrimary = {
  status: "HOLD",
  stage: "ATOMIC_COMMIT",
  reason: "BACKEND_FAILURE",
};

function receiptBackend(decision, counter = null) {
  return {
    async readByAuthorityKey() {
      if (counter) counter.calls += 1;
      return decision;
    },
  };
}

test("primary COMMITTED is final and never reads receipt", async () => {
  const counter = { calls: 0 };
  const d = await reconcileObservedReentryAtomicCommitOutcome({
    primaryDecision: committedPrimary,
    backendObservation: { kind: "RETURNED", status: "COMMITTED" },
    lease,
    atomicCommit,
    receiptBackend: receiptBackend({ status: "NOT_FOUND" }, counter),
  });
  assert.deepEqual(d, {
    status: "COMMITTED",
    source: "PRIMARY_RPC",
    commitSequence: 5,
    authorityKey: lease.authorityKey,
  });
  assert.equal(counter.calls, 0);
});

test("definite COMMIT_REJECTED BACKEND_FAILURE is HOLD and never reads receipt", async () => {
  const counter = { calls: 0 };
  const d = await reconcileObservedReentryAtomicCommitOutcome({
    primaryDecision: ambiguousPrimary,
    backendObservation: { kind: "RETURNED", status: "COMMIT_REJECTED" },
    lease,
    atomicCommit,
    receiptBackend: receiptBackend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.deepEqual(d, ambiguousPrimary);
  assert.equal(counter.calls, 0);
});

test("thrown backend plus exact durable receipt resolves to COMMITTED without retry", async () => {
  const counter = { calls: 0 };
  const d = await reconcileObservedReentryAtomicCommitOutcome({
    primaryDecision: ambiguousPrimary,
    backendObservation: { kind: "THREW" },
    lease,
    atomicCommit,
    receiptBackend: receiptBackend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.deepEqual(d, {
    status: "COMMITTED",
    source: "DURABLE_RECEIPT",
    commitSequence: 5,
    authorityKey: lease.authorityKey,
    committedAt: "2026-09-12T09:00:02.000Z",
  });
  assert.equal(counter.calls, 1);
});

test("thrown backend plus missing receipt remains UNKNOWN and explicitly forbids retry", async () => {
  const d = await reconcileObservedReentryAtomicCommitOutcome({
    primaryDecision: ambiguousPrimary,
    backendObservation: { kind: "THREW" },
    lease,
    atomicCommit,
    receiptBackend: receiptBackend({ status: "NOT_FOUND" }),
  });
  assert.deepEqual(d, {
    status: "UNKNOWN_OUTCOME",
    reason: "RECEIPT_NOT_FOUND",
    authorityKey: lease.authorityKey,
    retryDisposition: "DO_NOT_RETRY",
  });
});

test("receipt backend outage remains UNKNOWN and explicitly forbids retry", async () => {
  const d = await reconcileObservedReentryAtomicCommitOutcome({
    primaryDecision: ambiguousPrimary,
    backendObservation: { kind: "THREW" },
    lease,
    atomicCommit,
    receiptBackend: { async readByAuthorityKey() { throw new Error("network"); } },
  });
  assert.equal(d.status, "UNKNOWN_OUTCOME");
  assert.equal(d.reason, "RECEIPT_BACKEND_FAILURE");
  assert.equal(d.retryDisposition, "DO_NOT_RETRY");
});

test("forged durable receipt becomes reconciliation HOLD and forbids retry", async () => {
  const d = await reconcileObservedReentryAtomicCommitOutcome({
    primaryDecision: ambiguousPrimary,
    backendObservation: { kind: "THREW" },
    lease,
    atomicCommit,
    receiptBackend: receiptBackend({
      status: "COMMITTED",
      receipt: receipt({ authorityKey: "FORGED" }),
    }),
  });
  assert.deepEqual(d, {
    status: "HOLD",
    stage: "OUTCOME_RECONCILIATION",
    reason: "RECEIPT_BINDING_MISMATCH",
    retryDisposition: "DO_NOT_RETRY",
  });
});

test("non-atomic HOLD never probes receipt", async () => {
  const counter = { calls: 0 };
  const primary = {
    status: "HOLD",
    stage: "AUTHORITY",
    reason: "LEASE_EXPIRED",
  };
  const d = await reconcileObservedReentryAtomicCommitOutcome({
    primaryDecision: primary,
    backendObservation: { kind: "NOT_INVOKED" },
    lease,
    atomicCommit,
    receiptBackend: receiptBackend({ status: "NOT_FOUND" }, counter),
  });
  assert.deepEqual(d, primary);
  assert.equal(counter.calls, 0);
});

test("missing verified atomic commit cannot be upgraded by receipt", async () => {
  const counter = { calls: 0 };
  const d = await reconcileObservedReentryAtomicCommitOutcome({
    primaryDecision: ambiguousPrimary,
    backendObservation: { kind: "THREW" },
    lease,
    atomicCommit: null,
    receiptBackend: receiptBackend({ status: "COMMITTED", receipt: receipt() }, counter),
  });
  assert.deepEqual(d, ambiguousPrimary);
  assert.equal(counter.calls, 0);
});
