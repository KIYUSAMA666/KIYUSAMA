// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  createSupabaseJsReentryDurableCommitReceiptBackend,
} from "../src/supabase-reentry-durable-commit-receipt-backend.js";

const authorityKey = '["OS2_REENTRY_AUTHORITY_V01","NA-1","CS-MAIN",12,4,"ATT-1","2026-09-12T08:59:00.000Z","KIRA"]';

function validReceipt(overrides = {}) {
  return {
    status: "COMMITTED",
    receiptVersion: "OS2_REENTRY_COMMIT_RECEIPT_V01",
    authorityKey,
    leaseId: "LEASE-1",
    actionId: "NA-1",
    stateId: "CS-MAIN",
    fromRevision: 12,
    toRevision: 13,
    priorCommitSequence: 4,
    committedSequence: 5,
    resultId: "RESULT-1",
    handoffId: "HANDOFF-1",
    nextCurrent: { identity: { stateId: "CS-MAIN", stateRevision: 13 } },
    committedAt: "2026-09-12T09:00:02.000Z",
    ...overrides,
  };
}

test("calls exact receipt RPC once with authority key", async () => {
  const calls = [];
  const backend = createSupabaseJsReentryDurableCommitReceiptBackend({
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: validReceipt(), error: null };
    },
  });
  const d = await backend.readByAuthorityKey(authorityKey);
  assert.equal(d.status, "COMMITTED");
  assert.equal(d.receipt.committedSequence, 5);
  assert.deepEqual(calls, [{
    name: "os2_reentry_read_atomic_commit_receipt",
    args: { p_authority_key: authorityKey },
  }]);
});

test("NOT_FOUND propagates exactly", async () => {
  const backend = createSupabaseJsReentryDurableCommitReceiptBackend({
    async rpc() { return { data: { status: "NOT_FOUND" }, error: null }; },
  });
  assert.deepEqual(await backend.readByAuthorityKey(authorityKey), { status: "NOT_FOUND" });
});

test("BINDING_MISMATCH propagates exactly", async () => {
  const backend = createSupabaseJsReentryDurableCommitReceiptBackend({
    async rpc() { return { data: { status: "BINDING_MISMATCH" }, error: null }; },
  });
  assert.deepEqual(await backend.readByAuthorityKey(authorityKey), { status: "BINDING_MISMATCH" });
});

test("provider error throws", async () => {
  const backend = createSupabaseJsReentryDurableCommitReceiptBackend({
    async rpc() { return { data: null, error: new Error("provider") }; },
  });
  await assert.rejects(() => backend.readByAuthorityKey(authorityKey));
});

test("malformed COMMITTED response throws", async () => {
  const backend = createSupabaseJsReentryDurableCommitReceiptBackend({
    async rpc() { return { data: validReceipt({ committedSequence: "5" }), error: null }; },
  });
  await assert.rejects(() => backend.readByAuthorityKey(authorityKey));
});

test("forged authority key in COMMITTED response throws", async () => {
  const backend = createSupabaseJsReentryDurableCommitReceiptBackend({
    async rpc() { return { data: validReceipt({ authorityKey: "FORGED" }), error: null }; },
  });
  await assert.rejects(() => backend.readByAuthorityKey(authorityKey));
});

test("unknown status throws", async () => {
  const backend = createSupabaseJsReentryDurableCommitReceiptBackend({
    async rpc() { return { data: { status: "MAYBE" }, error: null }; },
  });
  await assert.rejects(() => backend.readByAuthorityKey(authorityKey));
});
