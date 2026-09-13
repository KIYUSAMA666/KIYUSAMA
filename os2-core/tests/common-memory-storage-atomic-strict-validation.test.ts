// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStorageAtomicCommit,
  validateStorageAtomicCommitCommand,
  type StorageAtomicCommitBackend,
} from "../src/storage-atomic-commit-adapter.js";
import { applyStorageAtomicCommitAsync } from "../src/production-async-commit-bridge.js";

function snapshot(revision = 4) {
  return {
    identity: {
      stateId: "CS-STRICT",
      schemaVersion: "0.1",
      stateRevision: revision,
      effectiveAt: "2026-09-13T10:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-STRICT-1",
    },
    humanDecisionFinal: {
      decisionId: "HD-STRICT-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "strict storage boundary",
    },
    mainLineTask: { taskId: "ML-STRICT", description: "strict storage" },
    nextActionSingle: { actionId: "NA-STRICT", description: "persist safely" },
    activeRolesAndAuthority: { SORA: "AGGREGATOR", KIRA: "INDEPENDENT_VERIFIER" },
    activeGuards: [{ guardId: "G-1", rule: "fail closed", refConfirmed: "VERIFIED" }],
    confirmedRefIndex: [{ id: "REF-1", status: "VERIFIED", expectedVersion: "1", path: "evidence/REF-1" }],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-13T09:59:00+09:00",
      evidenceSource: "KIRA",
    },
  };
}

function commit() {
  const nextCurrent = {
    ...snapshot(5),
    writeBack: {
      parent: { parentStateId: "CS-STRICT", parentRevision: 4 },
      source: { sourceResultId: "RESULT-STRICT", sourceHandoffId: "HANDOFF-STRICT" },
    },
  };
  return {
    expectedCurrent: {
      expectedCurrentStateId: "CS-STRICT",
      expectedCurrentRevision: 4,
    },
    consumeResultId: "RESULT-STRICT",
    consumeHandoffId: "HANDOFF-STRICT",
    nextCurrent,
  };
}

function commandFrom(commitValue) {
  return {
    expectedCurrentStateId: commitValue.expectedCurrent.expectedCurrentStateId,
    expectedCurrentRevision: commitValue.expectedCurrent.expectedCurrentRevision,
    consumeResultId: commitValue.consumeResultId,
    consumeHandoffId: commitValue.consumeHandoffId,
    nextCurrent: commitValue.nextCurrent,
  };
}

test("1 canonical atomic command remains valid", () => {
  assert.equal(validateStorageAtomicCommitCommand(commandFrom(commit())), null);
});

test("2 malformed activeGuards is rejected before sync backend", () => {
  let calls = 0;
  const backend: StorageAtomicCommitBackend = {
    compareConsumeAndSwap() {
      calls += 1;
      throw new Error("must not be called");
    },
  };
  const attacked = commit();
  attacked.nextCurrent.activeGuards[0].refConfirmed = "FORGED";
  assert.deepEqual(applyStorageAtomicCommit(backend, attacked), {
    status: "HOLD",
    reason: "INVALID_ATOMIC_COMMIT",
  });
  assert.equal(calls, 0);
});

test("3 unknown root execution authority is rejected at storage boundary", () => {
  let calls = 0;
  const backend: StorageAtomicCommitBackend = {
    compareConsumeAndSwap() {
      calls += 1;
      throw new Error("must not be called");
    },
  };
  const attacked = commit();
  attacked.nextCurrent.injectedExecutionAuthority = { execute: true };
  assert.deepEqual(applyStorageAtomicCommit(backend, attacked), {
    status: "HOLD",
    reason: "INVALID_ATOMIC_COMMIT",
  });
  assert.equal(calls, 0);
});

test("4 unknown writeBack provenance fields are rejected rather than silently persisted", () => {
  const attacked = commit();
  attacked.nextCurrent.writeBack.parent.injected = "ATTACK";
  assert.equal(
    validateStorageAtomicCommitCommand(commandFrom(attacked)),
    "INVALID_ATOMIC_COMMIT",
  );
});

test("5 negative writeBack parent revision is rejected", () => {
  const attacked = commit();
  attacked.nextCurrent.writeBack.parent.parentRevision = -1;
  assert.equal(
    validateStorageAtomicCommitCommand(commandFrom(attacked)),
    "INVALID_ATOMIC_COMMIT",
  );
});

test("6 async bridge cannot bypass strict storage validation", async () => {
  let calls = 0;
  const backend = {
    async compareConsumeAndSwap() {
      calls += 1;
      throw new Error("must not be called");
    },
  };
  const attacked = commit();
  attacked.nextCurrent.confirmedRefIndex[0].expectedVersion = 123;
  assert.deepEqual(await applyStorageAtomicCommitAsync(backend, attacked), {
    status: "HOLD",
    reason: "INVALID_ATOMIC_COMMIT",
  });
  assert.equal(calls, 0);
});
