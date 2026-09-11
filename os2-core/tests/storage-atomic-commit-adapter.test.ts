import test from "node:test";
import assert from "node:assert/strict";
import type { CurrentStateSnapshot } from "../src/current-state.js";
import {
  applyStorageAtomicCommit,
  InMemoryAtomicCommitBackend,
  type StorageAtomicCommitBackend,
  type StorageAtomicCommitCommand,
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
    mainLineTask: { taskId: "ML-1", description: "atomic storage" },
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

function candidate(
  parentRevision = 12,
  resultId = "RESULT-1",
  handoffId = "HANDOFF-1",
): WriteBackCurrentStateCandidate {
  const base = current(parentRevision);
  return {
    ...base,
    identity: {
      ...base.identity,
      stateRevision: parentRevision + 1,
      effectiveAt: "2026-09-11T13:10:00+09:00",
    },
    writeBack: {
      parent: { parentStateId: "CS-MAIN", parentRevision },
      source: { sourceResultId: resultId, sourceHandoffId: handoffId },
    },
  };
}

function commit(
  parentRevision = 12,
  resultId = "RESULT-1",
  handoffId = "HANDOFF-1",
): WriteBackAtomicCommit {
  return {
    expectedCurrent: {
      expectedCurrentStateId: "CS-MAIN",
      expectedCurrentRevision: parentRevision,
    },
    consumeResultId: resultId,
    consumeHandoffId: handoffId,
    nextCurrent: candidate(parentRevision, resultId, handoffId),
  };
}

test("1 normal commit atomically advances CURRENT and consumes result+handoff", () => {
  const backend = new InMemoryAtomicCommitBackend({ current: current() });
  const decision = applyStorageAtomicCommit(backend, commit());
  assert.equal(decision.status, "COMMITTED");
  if (decision.status !== "COMMITTED") return;
  assert.equal(decision.current.identity.stateRevision, 13);
  assert.equal(decision.commitSequence, 1);

  assert.deepEqual(backend.snapshot(), {
    current: candidate(),
    consumedResultIds: ["RESULT-1"],
    consumedHandoffIds: ["HANDOFF-1"],
    commitSequence: 1,
  });
});

test("2 stale CAS cannot modify any persisted field", () => {
  const backend = new InMemoryAtomicCommitBackend({ current: current(13) });
  const before = backend.snapshot();
  assert.deepEqual(applyStorageAtomicCommit(backend, commit(12)), {
    status: "HOLD",
    reason: "REVISION_CONFLICT",
  });
  assert.deepEqual(backend.snapshot(), before);
});

test("3 consumed result blocks commit without consuming handoff or advancing CURRENT", () => {
  const backend = new InMemoryAtomicCommitBackend({
    current: current(),
    consumedResultIds: ["RESULT-1"],
  });
  const before = backend.snapshot();
  assert.deepEqual(applyStorageAtomicCommit(backend, commit()), {
    status: "HOLD",
    reason: "RESULT_ALREADY_CONSUMED",
  });
  assert.deepEqual(backend.snapshot(), before);
});

test("4 consumed handoff blocks commit without consuming result or advancing CURRENT", () => {
  const backend = new InMemoryAtomicCommitBackend({
    current: current(),
    consumedHandoffIds: ["HANDOFF-1"],
  });
  const before = backend.snapshot();
  assert.deepEqual(applyStorageAtomicCommit(backend, commit()), {
    status: "HOLD",
    reason: "HANDOFF_ALREADY_CONSUMED",
  });
  assert.deepEqual(backend.snapshot(), before);
});

test("5 simulated backend failure before commit leaves all three effects untouched", () => {
  const backend = new InMemoryAtomicCommitBackend({ current: current() });
  backend.setFailBeforeCommitForTest(true);
  const before = backend.snapshot();
  assert.deepEqual(applyStorageAtomicCommit(backend, commit()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
  assert.deepEqual(backend.snapshot(), before);
});

test("6 two competing commits from the same parent cannot both win", () => {
  const backend = new InMemoryAtomicCommitBackend({ current: current() });
  const first = applyStorageAtomicCommit(backend, commit(12, "RESULT-A", "HANDOFF-A"));
  const second = applyStorageAtomicCommit(backend, commit(12, "RESULT-B", "HANDOFF-B"));
  assert.equal(first.status, "COMMITTED");
  assert.deepEqual(second, { status: "HOLD", reason: "REVISION_CONFLICT" });

  const stored = backend.snapshot();
  assert.equal(stored.current.identity.stateRevision, 13);
  assert.deepEqual(stored.consumedResultIds, ["RESULT-A"]);
  assert.deepEqual(stored.consumedHandoffIds, ["HANDOFF-A"]);
  assert.equal(stored.commitSequence, 1);
});

test("7 replay on the fresh revision is blocked by consumed result", () => {
  const backend = new InMemoryAtomicCommitBackend({ current: current() });
  assert.equal(applyStorageAtomicCommit(backend, commit()).status, "COMMITTED");

  const replay = commit(13, "RESULT-1", "HANDOFF-2");
  assert.deepEqual(applyStorageAtomicCommit(backend, replay), {
    status: "HOLD",
    reason: "RESULT_ALREADY_CONSUMED",
  });
  assert.equal(backend.snapshot().current.identity.stateRevision, 13);
});

test("8 adapter rejects source/consumption mismatch before backend is invoked", () => {
  let calls = 0;
  const backend: StorageAtomicCommitBackend = {
    compareConsumeAndSwap(_command: StorageAtomicCommitCommand) {
      calls += 1;
      return { status: "HOLD", reason: "BACKEND_FAILURE" };
    },
  };
  const malformed = commit();
  malformed.consumeResultId = "RESULT-ATTACK";
  assert.deepEqual(applyStorageAtomicCommit(backend, malformed), {
    status: "HOLD",
    reason: "INVALID_ATOMIC_COMMIT",
  });
  assert.equal(calls, 0);
});

test("9 adapter rejects revision skip before backend is invoked", () => {
  let calls = 0;
  const backend: StorageAtomicCommitBackend = {
    compareConsumeAndSwap() {
      calls += 1;
      return { status: "HOLD", reason: "BACKEND_FAILURE" };
    },
  };
  const malformed = commit();
  malformed.nextCurrent.identity.stateRevision = 99;
  assert.deepEqual(applyStorageAtomicCommit(backend, malformed), {
    status: "HOLD",
    reason: "INVALID_ATOMIC_COMMIT",
  });
  assert.equal(calls, 0);
});

test("10 adapter invokes exactly one backend atomic primitive on a valid commit", () => {
  let calls = 0;
  const backend: StorageAtomicCommitBackend = {
    compareConsumeAndSwap(command) {
      calls += 1;
      return { status: "COMMITTED", current: command.nextCurrent, commitSequence: 44 };
    },
  };
  const decision = applyStorageAtomicCommit(backend, commit());
  assert.equal(decision.status, "COMMITTED");
  assert.equal(calls, 1);
});

test("11 backend throw can never be translated into COMMITTED", () => {
  const backend: StorageAtomicCommitBackend = {
    compareConsumeAndSwap() {
      throw new Error("storage unavailable");
    },
  };
  assert.deepEqual(applyStorageAtomicCommit(backend, commit()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("12 invalid KIYUSAMA snapshot invariant is rejected before persistence", () => {
  let calls = 0;
  const backend: StorageAtomicCommitBackend = {
    compareConsumeAndSwap() {
      calls += 1;
      return { status: "HOLD", reason: "BACKEND_FAILURE" };
    },
  };
  const malformed = commit();
  (malformed.nextCurrent.humanDecisionFinal as { sourceAuthority: string }).sourceAuthority = "ATTACKER";
  assert.deepEqual(applyStorageAtomicCommit(backend, malformed), {
    status: "HOLD",
    reason: "INVALID_ATOMIC_COMMIT",
  });
  assert.equal(calls, 0);
});
