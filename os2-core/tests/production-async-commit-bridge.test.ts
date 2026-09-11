import test from "node:test";
import assert from "node:assert/strict";
import type { CurrentStateSnapshot } from "../src/current-state.js";
import {
  applyStorageAtomicCommitAsync,
  type AsyncStorageAtomicCommitBackend,
} from "../src/production-async-commit-bridge.js";
import { InMemoryAtomicCommitBackend } from "../src/storage-atomic-commit-adapter.js";
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
    mainLineTask: { taskId: "ML-1", description: "async bridge" },
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

function candidate(parentRevision = 12): WriteBackCurrentStateCandidate {
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
      source: { sourceResultId: "RESULT-1", sourceHandoffId: "HANDOFF-1" },
    },
  };
}

function commit(): WriteBackAtomicCommit {
  return {
    expectedCurrent: {
      expectedCurrentStateId: "CS-MAIN",
      expectedCurrentRevision: 12,
    },
    consumeResultId: "RESULT-1",
    consumeHandoffId: "HANDOFF-1",
    nextCurrent: candidate(),
  };
}

test("sync reference backend remains compatible through async bridge", async () => {
  const backend = new InMemoryAtomicCommitBackend({ current: current() });
  const decision = await applyStorageAtomicCommitAsync(backend, commit());
  assert.equal(decision.status, "COMMITTED");
  assert.equal(backend.snapshot().commitSequence, 1);
});

test("async backend is awaited and invoked exactly once", async () => {
  let calls = 0;
  const backend: AsyncStorageAtomicCommitBackend = {
    async compareConsumeAndSwap(command) {
      calls += 1;
      await Promise.resolve();
      return { status: "COMMITTED", current: command.nextCurrent, commitSequence: 7 };
    },
  };
  const decision = await applyStorageAtomicCommitAsync(backend, commit());
  assert.deepEqual(decision, { status: "COMMITTED", current: candidate(), commitSequence: 7 });
  assert.equal(calls, 1);
});

test("async rejection fails closed", async () => {
  const backend: AsyncStorageAtomicCommitBackend = {
    async compareConsumeAndSwap() {
      throw new Error("network down");
    },
  };
  assert.deepEqual(await applyStorageAtomicCommitAsync(backend, commit()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("invalid commit is rejected before async backend invocation", async () => {
  let calls = 0;
  const backend: AsyncStorageAtomicCommitBackend = {
    async compareConsumeAndSwap() {
      calls += 1;
      return { status: "HOLD", reason: "BACKEND_FAILURE" };
    },
  };
  const malformed = commit();
  malformed.consumeResultId = "RESULT-ATTACK";
  assert.deepEqual(await applyStorageAtomicCommitAsync(backend, malformed), {
    status: "HOLD",
    reason: "INVALID_ATOMIC_COMMIT",
  });
  assert.equal(calls, 0);
});

test("remote committed response cannot substitute a different CURRENT payload", async () => {
  const substituted = candidate();
  substituted.nextActionSingle = { actionId: "ATTACK", description: "substituted" };
  const backend: AsyncStorageAtomicCommitBackend = {
    async compareConsumeAndSwap() {
      return { status: "COMMITTED", current: substituted, commitSequence: 1 };
    },
  };
  assert.deepEqual(await applyStorageAtomicCommitAsync(backend, commit()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("malformed committed sequence fails closed", async () => {
  const backend = {
    async compareConsumeAndSwap(command: Parameters<AsyncStorageAtomicCommitBackend["compareConsumeAndSwap"]>[0]) {
      return { status: "COMMITTED", current: command.nextCurrent, commitSequence: 0 } as never;
    },
  };
  assert.deepEqual(await applyStorageAtomicCommitAsync(backend, commit()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("jsonb object-key reordering is accepted at the outer async bridge", async () => {
  const expected = candidate();
  const reordered = {
    writeBack: {
      source: {
        sourceHandoffId: expected.writeBack.source.sourceHandoffId,
        sourceResultId: expected.writeBack.source.sourceResultId,
      },
      parent: {
        parentRevision: expected.writeBack.parent.parentRevision,
        parentStateId: expected.writeBack.parent.parentStateId,
      },
    },
    independentLaneHealth: {
      evidenceSource: expected.independentLaneHealth.evidenceSource,
      observedAt: expected.independentLaneHealth.observedAt,
      evidenceVerdict: expected.independentLaneHealth.evidenceVerdict,
      status: expected.independentLaneHealth.status,
    },
    confirmedRefIndex: expected.confirmedRefIndex,
    activeGuards: expected.activeGuards,
    activeRolesAndAuthority: expected.activeRolesAndAuthority,
    nextActionSingle: {
      description: expected.nextActionSingle.description,
      actionId: expected.nextActionSingle.actionId,
    },
    mainLineTask: {
      description: expected.mainLineTask.description,
      taskId: expected.mainLineTask.taskId,
    },
    humanDecisionFinal: {
      shortDirective: expected.humanDecisionFinal.shortDirective,
      sourceAuthority: expected.humanDecisionFinal.sourceAuthority,
      decisionId: expected.humanDecisionFinal.decisionId,
    },
    identity: {
      lineageId: expected.identity.lineageId,
      scope: expected.identity.scope,
      effectiveAt: expected.identity.effectiveAt,
      stateRevision: expected.identity.stateRevision,
      schemaVersion: expected.identity.schemaVersion,
      stateId: expected.identity.stateId,
    },
  } as WriteBackCurrentStateCandidate;

  const backend: AsyncStorageAtomicCommitBackend = {
    async compareConsumeAndSwap() {
      return { status: "COMMITTED", current: reordered, commitSequence: 1 };
    },
  };

  const decision = await applyStorageAtomicCommitAsync(backend, commit());
  assert.equal(decision.status, "COMMITTED");
  if (decision.status === "COMMITTED") assert.equal(decision.commitSequence, 1);
});
