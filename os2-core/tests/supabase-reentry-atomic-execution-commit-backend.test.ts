// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseJsReentryAtomicExecutionCommitBackend } from "../src/supabase-reentry-atomic-execution-commit-backend.js";

const lease = {
  leaseId: "LEASE-1",
  authorityKey: '["OS2_REENTRY_AUTHORITY_V01","A","S",2,1,"ATT","2026-09-12T00:00:00.000Z","KIRA"]',
  actionId: "A",
  stateId: "S",
  stateRevision: 2,
  commitSequence: 1,
  attestationId: "ATT",
  attestationObservedAt: "2026-09-12T00:00:00.000Z",
  attestationSource: "KIRA",
  reentryAuthorityExpiresAt: "2026-09-12T00:01:00.000Z",
  issuedAt: "2026-09-12T00:00:01.000Z",
  expiresAt: "2026-09-12T00:00:31.000Z",
};
const request = {
  leaseId: lease.leaseId,
  authorityKey: lease.authorityKey,
  actionId: lease.actionId,
  stateId: lease.stateId,
  stateRevision: lease.stateRevision,
  commitSequence: lease.commitSequence,
};
const atomicCommit = {
  expectedCurrent: { expectedCurrentStateId: "S", expectedCurrentRevision: 2 },
  consumeResultId: "R",
  consumeHandoffId: "H",
  nextCurrent: { identity: { stateId: "S", stateRevision: 3 } },
};

function input() {
  return { lease, request, claimedAt: "CALLER-TIME-MUST-NOT-CROSS", atomicCommit };
}

test("1 calls exact combined RPC once and omits caller claimedAt", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: { status: "COMMITTED", commitSequence: 2, authorityKey: lease.authorityKey },
        error: null,
      };
    },
  };
  const backend = createSupabaseJsReentryAtomicExecutionCommitBackend(client);
  assert.deepEqual(await backend.claimAuthorityAndCommit(input()), {
    status: "COMMITTED",
    commitSequence: 2,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "os2_reentry_atomic_execution_commit");
  assert.deepEqual(calls[0].args, {
    p_input: { lease, request, atomicCommit },
  });
  assert.equal(JSON.stringify(calls[0]).includes("CALLER-TIME-MUST-NOT-CROSS"), false);
});

test("2 ALREADY_CONSUMED propagates", async () => {
  const backend = createSupabaseJsReentryAtomicExecutionCommitBackend({
    async rpc() { return { data: { status: "ALREADY_CONSUMED" }, error: null }; },
  });
  assert.deepEqual(await backend.claimAuthorityAndCommit(input()), { status: "ALREADY_CONSUMED" });
});

test("3 BINDING_MISMATCH propagates", async () => {
  const backend = createSupabaseJsReentryAtomicExecutionCommitBackend({
    async rpc() { return { data: { status: "BINDING_MISMATCH" }, error: null }; },
  });
  assert.deepEqual(await backend.claimAuthorityAndCommit(input()), { status: "BINDING_MISMATCH" });
});

test("4 COMMIT_REJECTED exact reason propagates", async () => {
  const backend = createSupabaseJsReentryAtomicExecutionCommitBackend({
    async rpc() { return { data: { status: "COMMIT_REJECTED", reason: "REVISION_CONFLICT" }, error: null }; },
  });
  assert.deepEqual(await backend.claimAuthorityAndCommit(input()), {
    status: "COMMIT_REJECTED",
    reason: "REVISION_CONFLICT",
  });
});

test("5 provider error throws", async () => {
  const error = new Error("provider");
  const backend = createSupabaseJsReentryAtomicExecutionCommitBackend({
    async rpc() { return { data: null, error }; },
  });
  await assert.rejects(() => backend.claimAuthorityAndCommit(input()), error);
});

test("6 malformed and unknown responses throw", async () => {
  for (const data of [null, [], {}, { status: "UNKNOWN" }]) {
    const backend = createSupabaseJsReentryAtomicExecutionCommitBackend({
      async rpc() { return { data, error: null }; },
    });
    await assert.rejects(() => backend.claimAuthorityAndCommit(input()));
  }
});

test("7 malformed COMMITTED sequence throws", async () => {
  for (const commitSequence of [-1, 1.5, "2", null]) {
    const backend = createSupabaseJsReentryAtomicExecutionCommitBackend({
      async rpc() {
        return { data: { status: "COMMITTED", commitSequence, authorityKey: lease.authorityKey }, error: null };
      },
    });
    await assert.rejects(() => backend.claimAuthorityAndCommit(input()));
  }
});

test("8 forged COMMITTED authorityKey throws", async () => {
  const backend = createSupabaseJsReentryAtomicExecutionCommitBackend({
    async rpc() {
      return { data: { status: "COMMITTED", commitSequence: 2, authorityKey: "FORGED" }, error: null };
    },
  });
  await assert.rejects(() => backend.claimAuthorityAndCommit(input()), /authority key mismatch/);
});

test("9 COMMIT_REJECTED without nonblank reason throws", async () => {
  for (const reason of [null, "", "   "]) {
    const backend = createSupabaseJsReentryAtomicExecutionCommitBackend({
      async rpc() { return { data: { status: "COMMIT_REJECTED", reason }, error: null }; },
    });
    await assert.rejects(() => backend.claimAuthorityAndCommit(input()));
  }
});
