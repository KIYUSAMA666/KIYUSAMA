import test from "node:test";
import assert from "node:assert/strict";
import {
  createSupabaseJsAtomicRpcClient,
  type SupabaseJsClientLike,
} from "../src/supabase-storage-atomic-backend.js";
import type { StorageAtomicCommitCommand } from "../src/storage-atomic-commit-adapter.js";

const command = {
  expectedCurrentStateId: "CS-MAIN",
  expectedCurrentRevision: 12,
  consumeResultId: "RESULT-1",
  consumeHandoffId: "HANDOFF-1",
  nextCurrent: {},
} as StorageAtomicCommitCommand;

test("supabase-js bridge uses private schema RPC and sends p_command exactly once", async () => {
  const calls: unknown[] = [];
  const client: SupabaseJsClientLike = {
    schema(schemaName) {
      calls.push(["schema", schemaName]);
      return {
        async rpc(functionName, args) {
          calls.push(["rpc", functionName, args]);
          return { data: { status: "HOLD", reason: "REVISION_CONFLICT" }, error: null };
        },
      };
    },
  };

  const rpc = createSupabaseJsAtomicRpcClient(client);
  const result = await rpc.compareConsumeAndSwap(command);
  assert.deepEqual(result, { status: "HOLD", reason: "REVISION_CONFLICT" });
  assert.deepEqual(calls, [
    ["schema", "os2_storage_v01"],
    ["rpc", "compare_consume_and_swap", { p_command: command }],
  ]);
});

test("supabase-js bridge throws provider error instead of treating it as data", async () => {
  const providerError = { message: "rpc failed" };
  const client: SupabaseJsClientLike = {
    schema() {
      return {
        async rpc() {
          return { data: null, error: providerError };
        },
      };
    },
  };

  const rpc = createSupabaseJsAtomicRpcClient(client);
  await assert.rejects(() => rpc.compareConsumeAndSwap(command), (error) => error === providerError);
});
