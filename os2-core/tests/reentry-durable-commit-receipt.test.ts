// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  REENTRY_COMMIT_RECEIPT_VERSION,
  recoverReentryAtomicCommitOutcome,
} from "../src/reentry-durable-commit-receipt.js";

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

function backend(decision) {
  return { async readByAuthorityKey() { return decision; } };
}

test("exact durable receipt resolves ambiguous outcome to COMMITTED", async () => {
  const d = await recoverReentryAtomicCommitOutcome({
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "COMMITTED", receipt: receipt() }),
  });
  assert.deepEqual(d, {
    status: "COMMITTED",
    source: "DURABLE_RECEIPT",
    commitSequence: 5,
    authorityKey: lease.authorityKey,
    committedAt: "2026-09-12T09:00:02.000Z",
  });
});

test("jsonb-style object key reordering still matches exact next CURRENT", async () => {
  const reordered = {
    writeBack: nextCurrent.writeBack,
    humanDecisionFinal: nextCurrent.humanDecisionFinal,
    nextActionSingle: nextCurrent.nextActionSingle,
    identity: {
      scope: "KIYUSAMA_OS_2",
      effectiveAt: "2026-09-12T09:00:00Z",
      schemaVersion: "0.1",
      lineageId: "LINEAGE-1",
      stateRevision: 13,
      stateId: "CS-MAIN",
    },
  };
  const d = await recoverReentryAtomicCommitOutcome({
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "COMMITTED", receipt: receipt({ nextCurrent: reordered }) }),
  });
  assert.equal(d.status, "COMMITTED");
});

test("receipt authority substitution is HOLD", async () => {
  const d = await recoverReentryAtomicCommitOutcome({
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "COMMITTED", receipt: receipt({ authorityKey: "FORGED" }) }),
  });
  assert.deepEqual(d, {
    status: "HOLD",
    reason: "RECEIPT_BINDING_MISMATCH",
    authorityKey: lease.authorityKey,
  });
});

test("receipt next CURRENT mutation is HOLD", async () => {
  const mutated = structuredClone(nextCurrent);
  mutated.nextActionSingle.actionId = "OTHER";
  const d = await recoverReentryAtomicCommitOutcome({
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "COMMITTED", receipt: receipt({ nextCurrent: mutated }) }),
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "RECEIPT_BINDING_MISMATCH");
});

test("receipt commit sequence substitution is HOLD", async () => {
  const d = await recoverReentryAtomicCommitOutcome({
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "COMMITTED", receipt: receipt({ committedSequence: 6 }) }),
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "RECEIPT_BINDING_MISMATCH");
});

test("missing receipt remains UNKNOWN rather than being treated as not committed", async () => {
  const d = await recoverReentryAtomicCommitOutcome({
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "NOT_FOUND" }),
  });
  assert.deepEqual(d, {
    status: "UNKNOWN_OUTCOME",
    reason: "RECEIPT_NOT_FOUND",
    authorityKey: lease.authorityKey,
  });
});

test("receipt backend failure remains UNKNOWN", async () => {
  const d = await recoverReentryAtomicCommitOutcome({
    lease,
    atomicCommit,
    receiptBackend: { async readByAuthorityKey() { throw new Error("network"); } },
  });
  assert.equal(d.status, "UNKNOWN_OUTCOME");
  assert.equal(d.reason, "RECEIPT_BACKEND_FAILURE");
});

test("backend binding mismatch is HOLD", async () => {
  const d = await recoverReentryAtomicCommitOutcome({
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "BINDING_MISMATCH" }),
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "RECEIPT_BINDING_MISMATCH");
});

test("malformed committed timestamp fails closed", async () => {
  const d = await recoverReentryAtomicCommitOutcome({
    lease,
    atomicCommit,
    receiptBackend: backend({ status: "COMMITTED", receipt: receipt({ committedAt: "not-a-time" }) }),
  });
  assert.equal(d.status, "HOLD");
  assert.equal(d.reason, "RECEIPT_PROTOCOL_FAILURE");
});
