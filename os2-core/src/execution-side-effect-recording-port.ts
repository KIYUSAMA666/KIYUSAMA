export type ExecutionSideEffectStatus = "STARTED" | "UNKNOWN" | "CONFIRMED";

export interface ExecutionSideEffectRpcClientLike {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export interface ExecutionSideEffectMarkInput {
  dispatchId: string;
  executionId: string;
  workerId: string;
  workerEpoch: number;
  authorityToken: string;
  sideEffectStatus: ExecutionSideEffectStatus;
  result: Readonly<Record<string, unknown>>;
  evidence: Readonly<Record<string, unknown>>;
}

export type ExecutionSideEffectMarkDecision =
  | { status: "RECORDED"; data: unknown }
  | { status: "HOLD"; reason: "INVALID_INPUT" | "RPC_ERROR" };

const MARK_SIDE_EFFECT_RPC = "execution_gate_mark_side_effect_v0";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validStatus(value: unknown): value is ExecutionSideEffectStatus {
  return value === "STARTED" || value === "UNKNOWN" || value === "CONFIRMED";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Thin adapter for the existing execution_v0 side-effect recorder.
 *
 * This module intentionally adds no BUS-specific state machine and no new
 * authority semantics. It only preserves the existing execution_v0 RPC
 * vocabulary so composition code does not duplicate raw rpc() calls.
 */
export async function markExecutionSideEffect(
  client: ExecutionSideEffectRpcClientLike,
  input: ExecutionSideEffectMarkInput,
): Promise<ExecutionSideEffectMarkDecision> {
  if (
    !nonEmpty(input.dispatchId) ||
    !nonEmpty(input.executionId) ||
    !nonEmpty(input.workerId) ||
    !positiveInteger(input.workerEpoch) ||
    !nonEmpty(input.authorityToken) ||
    !validStatus(input.sideEffectStatus) ||
    !isRecord(input.result) ||
    !isRecord(input.evidence)
  ) {
    return { status: "HOLD", reason: "INVALID_INPUT" };
  }

  try {
    const { data, error } = await client.rpc(MARK_SIDE_EFFECT_RPC, {
      p_dispatch_id: input.dispatchId,
      p_execution_id: input.executionId,
      p_worker_id: input.workerId,
      p_worker_epoch: input.workerEpoch,
      p_authority_token: input.authorityToken,
      p_side_effect_status: input.sideEffectStatus,
      p_result: input.result,
      p_evidence: input.evidence,
    });

    if (error !== null) return { status: "HOLD", reason: "RPC_ERROR" };
    return { status: "RECORDED", data };
  } catch {
    return { status: "HOLD", reason: "RPC_ERROR" };
  }
}
