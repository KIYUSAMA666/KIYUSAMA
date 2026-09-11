import test from "node:test";
import assert from "node:assert/strict";
import type { CurrentStateSnapshot } from "../src/current-state.js";
import {
  applyStorageAtomicCommitWithSupabase,
  parseSupabaseAtomicDecision,
  SupabaseStorageAtomicCommitBackend,
  type SupabaseAtomicRpcClient,
} from "../src/supabase-storage-atomic-backend.js";
import {
  applyStorageAtomicCommitAsync,
  toStorageAtomicCommitCommand,
} from "../src/storage-atomic-commit-adapter.js";
import type { WriteBackAtomicCommit, WriteBackCurrentStateCandidate } from "../src/write-back.js";

function current(revision = 12): CurrentStateSnapshot {
  return {
    identity: {
      stateId: "CS-MAIN",
      schemaVersion: "0.1",
      stateRevision: revision,
      effectiveAt: "2026-09-11T13:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-MAIN-001",
    },
    humanDecisionFinal: {
      decisionId: "HD-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "execute",
    },
    mainLineTask: { taskId: "ML-1", description: "supabase atomic storage" },
    nextActionSingle: { actionId: "NA-1", description: "persist exact commit" },
    activeRolesAndAuthority: { STORAGE_AUTHORITY: "AUTH-STORAGE-1" },
    activeGuards: [],
    confirmedRefIndex: [],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-11T13:05:00+09:00",
      evidenceSource: "KIRA-INDEPENDENT",
    },
  };
}

function candidate(parentRevision = 12, resultId = "RESULT-1", handoffId = "HANDOFF-1"): WriteBackCurrentStateCandidate {
  const base = current(parentRevision);
  return {
    ...base,
    identity: { ...base.identity, stateRevision: parentRevision + 1, effectiveAt: "2026-09-11T13:10:00+09:00" },
    writeBack: {
      parent: { parentStateId: "CS-MAIN", parentRevision },
      source: { sourceResultId: resultId, sourceHandoffId: handoffId },
    },
  };
}

function commit(parentRevision = 12, resultId = "RESULT-1", handoffId = "HANDOFF-1"): WriteBackAtomicCommit {
  return {
    expectedCurrent: { expectedCurrentStateId: "CS-MAIN", expectedCurrentRevision: parentRevision },
    consumeResultId: resultId,
    consumeHandoffId: handoffId,
    nextCurrent: candidate(parentRevision, resultId, handoffId),
  };
}

test("1 valid RPC COMMITTED response is accepted", async () => {
  let calls = 0;
  const client: SupabaseAtomicRpcClient = {
    async compareConsumeAndSwap(command) {
      calls += 1;
      return { status: "COMMITTED", current: command.nextCurrent, commitSequence: 7 };
    },
  };
  const decision = await applyStorageAtomicCommitWithSupabase(client, commit());
  assert.equal(decision.status, "COMMITTED");
  assert.equal(calls, 1);
});

test("2 known HOLD is propagated", async () => {
  const client: SupabaseAtomicRpcClient = {
    async compareConsumeAndSwap() {
      return { status: "HOLD", reason: "REVISION_CONFLICT" };
    },
  };
  assert.deepEqual(await applyStorageAtomicCommitWithSupabase(client, commit()), {
    status: "HOLD",
    reason: "REVISION_CONFLICT",
  });
});

test("3 malformed source binding is rejected before RPC", async () => {
  let calls = 0;
  const client: SupabaseAtomicRpcClient = {
    async compareConsumeAndSwap() {
      calls += 1;
      return { status: "COMMITTED", current: candidate(), commitSequence: 1 };
    },
  };
  const malformed = commit();
  malformed.consumeResultId = "RESULT-ATTACK";
  assert.deepEqual(await applyStorageAtomicCommitWithSupabase(client, malformed), {
    status: "HOLD",
    reason: "INVALID_ATOMIC_COMMIT",
  });
  assert.equal(calls, 0);
});

test("4 thrown provider error becomes BACKEND_FAILURE", async () => {
  const client: SupabaseAtomicRpcClient = {
    async compareConsumeAndSwap() {
      throw new Error("network/provider failure");
    },
  };
  assert.deepEqual(await applyStorageAtomicCommitWithSupabase(client, commit()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("5 unknown provider status fails closed", () => {
  const command = toStorageAtomicCommitCommand(commit());
  assert.deepEqual(parseSupabaseAtomicDecision({ status: "MAYBE" }, command), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("6 unknown HOLD reason fails closed", () => {
  const command = toStorageAtomicCommitCommand(commit());
  assert.deepEqual(parseSupabaseAtomicDecision({ status: "HOLD", reason: "IGNORE_GUARDS" }, command), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("7 forged COMMITTED payload is rejected", () => {
  const command = toStorageAtomicCommitCommand(commit());
  const forged = structuredClone(command.nextCurrent);
  forged.identity.stateRevision = 999;
  assert.deepEqual(parseSupabaseAtomicDecision({ status: "COMMITTED", current: forged, commitSequence: 2 }, command), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("8 COMMITTED response with invalid authority is rejected", () => {
  const command = toStorageAtomicCommitCommand(commit());
  const forged = structuredClone(command.nextCurrent);
  (forged.humanDecisionFinal as { sourceAuthority: string }).sourceAuthority = "ATTACKER";
  assert.deepEqual(parseSupabaseAtomicDecision({ status: "COMMITTED", current: forged, commitSequence: 2 }, command), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("9 invalid commitSequence is rejected", () => {
  const command = toStorageAtomicCommitCommand(commit());
  assert.deepEqual(parseSupabaseAtomicDecision({ status: "COMMITTED", current: command.nextCurrent, commitSequence: 0 }, command), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("10 exact command is sent once without caller-controlled weakening", async () => {
  const expected = toStorageAtomicCommitCommand(commit());
  let received: unknown;
  const client: SupabaseAtomicRpcClient = {
    async compareConsumeAndSwap(command) {
      received = command;
      return { status: "COMMITTED", current: command.nextCurrent, commitSequence: 1 };
    },
  };
  const decision = await applyStorageAtomicCommitWithSupabase(client, commit());
  assert.equal(decision.status, "COMMITTED");
  assert.deepEqual(received, expected);
});

test("11 production Supabase adapter satisfies async atomic backend contract", async () => {
  let calls = 0;
  const client: SupabaseAtomicRpcClient = {
    async compareConsumeAndSwap(command) {
      calls += 1;
      await Promise.resolve();
      return { status: "COMMITTED", current: command.nextCurrent, commitSequence: 11 };
    },
  };
  const backend = new SupabaseStorageAtomicCommitBackend(client);
  const decision = await applyStorageAtomicCommitAsync(backend, commit());
  assert.equal(decision.status, "COMMITTED");
  if (decision.status === "COMMITTED") assert.equal(decision.commitSequence, 11);
  assert.equal(calls, 1);
});

test("12 async provider cannot acknowledge a different CURRENT", async () => {
  const client: SupabaseAtomicRpcClient = {
    async compareConsumeAndSwap(command) {
      const forged = structuredClone(command.nextCurrent);
      forged.nextActionSingle = { actionId: "ATTACK", description: "provider substitution" };
      return { status: "COMMITTED", current: forged, commitSequence: 12 };
    },
  };
  const backend = new SupabaseStorageAtomicCommitBackend(client);
  assert.deepEqual(await applyStorageAtomicCommitAsync(backend, commit()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("13 async provider rejection/throw remains fail closed", async () => {
  const client: SupabaseAtomicRpcClient = {
    async compareConsumeAndSwap() {
      await Promise.resolve();
      throw new Error("network down");
    },
  };
  const backend = new SupabaseStorageAtomicCommitBackend(client);
  assert.deepEqual(await applyStorageAtomicCommitAsync(backend, commit()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});
