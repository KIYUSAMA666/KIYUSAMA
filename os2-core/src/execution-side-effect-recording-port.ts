export type ExecutionSideEffectStatus = "STARTED" | "UNKNOWN" | "CONFIRMED";

export interface ExecutionSideEffectRpcClientLike {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export interface ExecutionSideEffectMarkInput {
  taskId: string;
  executionId: string;
  authorityToken: string;
  status: ExecutionSideEffectStatus;
  result: Readonly<Record<string, unknown>>;
  evidence: Readonly<Record<string, unknown>>;
}

export type ExecutionSideEffectMarkDecision =
  | { status: "RECORDED" }
  | { status: "HOLD"; reason: "INVALID_INPUT" | "RPC_ERROR" };

const MARK_SIDE_EFFECT_RPC = "execution_gate_mark_side_effect_v0";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
 * The parameter names intentionally mirror the production RPC exactly:
 * p_task_id, p_execution_id, p_authority_token, p_status, p_result, p_evidence.
 * The RPC returns void; successful completion is represented only as RECORDED.
 * No BUS-specific state machine or authority semantics are introduced here.
 */
export async function markExecutionSideEffect(
  client: ExecutionSideEffectRpcClientLike,
  input: ExecutionSideEffectMarkInput,
): Promise<ExecutionSideEffectMarkDecision> {
  if (
    !nonEmpty(input.taskId) ||
    !nonEmpty(input.executionId) ||
    !nonEmpty(input.authorityToken) ||
    !validStatus(input.status) ||
    !isRecord(input.result) ||
    !isRecord(input.evidence)
  ) {
    return { status: "HOLD", reason: "INVALID_INPUT" };
  }

  try {
    const { error } = await client.rpc(MARK_SIDE_EFFECT_RPC, {
      p_task_id: input.taskId,
      p_execution_id: input.executionId,
      p_authority_token: input.authorityToken,
      p_status: input.status,
      p_result: input.result,
      p_evidence: input.evidence,
    });

    if (error !== null) return { status: "HOLD", reason: "RPC_ERROR" };
    return { status: "RECORDED" };
  } catch {
    return { status: "HOLD", reason: "RPC_ERROR" };
  }
}
