// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  createSupabaseJsCurrentReadClient,
  recoverProductionCurrent,
} from "../src/production-current-recovery.js";

function snapshot() {
  return {
    identity: {
      stateId: "OS2-PTE-V01-STATE",
      schemaVersion: "0.1",
      stateRevision: 2,
      effectiveAt: "2026-09-11T20:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "OS2-PTE-V01-LINEAGE",
    },
    humanDecisionFinal: {
      decisionId: "HD-PTE-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "production trusted execution proof",
    },
    mainLineTask: { taskId: "ML-PTE-1", description: "production proof" },
    nextActionSingle: { actionId: "NA-PTE-1", description: "recover durable current" },
    activeRolesAndAuthority: {},
    activeGuards: [],
    confirmedRefIndex: [],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-11T20:00:00+09:00",
      evidenceSource: "KIRA",
    },
    writeBack: {
      parent: { parentStateId: "OS2-PTE-V01-STATE", parentRevision: 1 },
      source: {
        sourceResultId: "OS2-PTE-V01-RESULT-001",
        sourceHandoffId: "OS2-PTE-V01-HANDOFF-001",
      },
    },
  };
}

function durable(overrides = {}) {
  return {
    stateId: "OS2-PTE-V01-STATE",
    revision: 2,
    current: snapshot(),
    commitSequence: 1,
    ...overrides,
  };
}

const expected = {
  stateId: "OS2-PTE-V01-STATE",
  lineageId: "OS2-PTE-V01-LINEAGE",
  minCommitSequence: 1,
};

test("1 supabase-js read bridge calls exact RPC once", async () => {
  const calls = [];
  const client = createSupabaseJsCurrentReadClient({
    rpc(name) {
      calls.push(name);
      return Promise.resolve({ data: durable(), error: null });
    },
  });
  const result = await client.readCurrent();
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "os2_storage_read_current");
  assert.equal(result.commitSequence, 1);
});

test("2 real-shaped durable CURRENT recovers", async () => {
  const result = await recoverProductionCurrent(
    { readCurrent: async () => durable() },
    expected,
  );
  assert.equal(result.status, "RECOVERED");
  assert.equal(result.commitSequence, 1);
  assert.equal(result.current.identity.stateRevision, 2);
});

test("3 missing durable CURRENT holds", async () => {
  const result = await recoverProductionCurrent(
    { readCurrent: async () => null },
    expected,
  );
  assert.deepEqual(result, { status: "HOLD", reason: "MISSING_CURRENT" });
});

test("4 foreign lineage from provider holds", async () => {
  const row = durable();
  row.current.identity.lineageId = "FOREIGN-LINEAGE";
  const result = await recoverProductionCurrent(
    { readCurrent: async () => row },
    expected,
  );
  assert.deepEqual(result, { status: "HOLD", reason: "LINEAGE_MISMATCH" });
});

test("5 provider error becomes BACKEND_FAILURE", async () => {
  const result = await recoverProductionCurrent(
    { readCurrent: async () => { throw new Error("network"); } },
    expected,
  );
  assert.deepEqual(result, { status: "HOLD", reason: "BACKEND_FAILURE" });
});

test("6 supabase-js error is never treated as data", async () => {
  const client = createSupabaseJsCurrentReadClient({
    rpc() {
      return Promise.resolve({ data: durable(), error: { message: "denied" } });
    },
  });
  const result = await recoverProductionCurrent(client, expected);
  assert.deepEqual(result, { status: "HOLD", reason: "BACKEND_FAILURE" });
});
