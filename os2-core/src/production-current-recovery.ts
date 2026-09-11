import {
  recoverDurableCurrent,
  type DurableCurrentExpectation,
  type DurableCurrentRecoveryDecision,
} from "./durable-current-recovery.js";

const SUPABASE_READ_CURRENT_RPC = "os2_storage_read_current";

export interface SupabaseCurrentReadClient {
  readCurrent(): Promise<unknown>;
}

export interface SupabaseJsReadClientLike {
  rpc(functionName: string): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export type ProductionCurrentRecoveryDecision =
  | DurableCurrentRecoveryDecision
  | { status: "HOLD"; reason: "BACKEND_FAILURE" };

export function createSupabaseJsCurrentReadClient(
  client: SupabaseJsReadClientLike,
): SupabaseCurrentReadClient {
  return {
    async readCurrent(): Promise<unknown> {
      const { data, error } = await client.rpc(SUPABASE_READ_CURRENT_RPC);
      if (error !== null) throw error;
      return data;
    },
  };
}

export async function recoverProductionCurrent(
  client: SupabaseCurrentReadClient,
  expected: DurableCurrentExpectation,
): Promise<ProductionCurrentRecoveryDecision> {
  try {
    const raw = await client.readCurrent();
    return recoverDurableCurrent(raw, expected);
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }
}
