// KIYUSAMA OS execution_v0 — promotion cleanup v4
// Reversible implementation branch; production deployment is separate.

type RpcResult = { ok?: boolean; error?: unknown; status?: string };
type AbortPromotion = (reservationId: string, reason: string) => Promise<RpcResult>;
type HoldPromotion = (reservationId: string, reason: string) => Promise<RpcResult>;

export const ABORTABLE_FAILURES = [
  "TARGET_PRECHECK_FAILED",
  "TARGET_WRITE_REJECTED_BEFORE_MUTATION",
] as const;

export const RECONCILE_REQUIRED_FAILURES = [
  "TARGET_WRITE_OUTCOME_UNKNOWN",
  "TARGET_READ_BACK_MISMATCH",
  "PROMOTION_FINALIZE_FAILED",
  "RECEIVER_RESPONSE_LOST_AFTER_TARGET_WRITE",
] as const;

export async function failBeforeTargetMutation(
  reservationId: string,
  failureCode: string,
  abortPromotion: AbortPromotion,
): Promise<Response> {
  try {
    const r = await abortPromotion(reservationId, failureCode.slice(0, 200));
    if (r?.ok) return Response.json({ok:false,code:failureCode,reservation_id:reservationId,cleanup:"ABORTED"},{status:502});
    return Response.json({ok:false,code:"PROMOTION_CLEANUP_HOLD",original_failure:failureCode,reservation_id:reservationId,cleanup_error:r?.error??"ABORT_REJECTED"},{status:500});
  } catch {
    return Response.json({ok:false,code:"PROMOTION_CLEANUP_HOLD",original_failure:failureCode,reservation_id:reservationId,cleanup_error:"ABORT_RPC_FAILED"},{status:500});
  }
}

export async function failAfterTargetMutationMayHaveOccurred(
  reservationId: string,
  failureCode: string,
  holdPromotion: HoldPromotion,
): Promise<Response> {
  // Never abort/retry blindly after the target mutation may have happened.
  // Freeze into HOLD/UNKNOWN until authoritative external read-back reconciles state.
  try {
    const r = await holdPromotion(reservationId, failureCode.slice(0, 200));
    return Response.json({
      ok:false,
      code:"PROMOTION_RECONCILIATION_REQUIRED",
      original_failure:failureCode,
      reservation_id:reservationId,
      hold_recorded:r?.ok===true,
      cleanup_error:r?.ok===true?undefined:(r?.error??"HOLD_REJECTED"),
    },{status:409});
  } catch {
    return Response.json({ok:false,code:"PROMOTION_RECONCILIATION_REQUIRED",original_failure:failureCode,reservation_id:reservationId,hold_recorded:false,cleanup_error:"HOLD_RPC_FAILED"},{status:500});
  }
}

// Safety invariant:
// PRE-WRITE proven failure -> ABORT is allowed.
// POST-WRITE or UNKNOWN outcome -> HOLD + external read-back reconciliation only.
// No blind retry after mutation uncertainty.
