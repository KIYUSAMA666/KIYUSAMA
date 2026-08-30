// KIYUSAMA OS execution_v0 — promotion cleanup candidate v3
// Reversible implementation candidate. Not production-deployed.

type AbortPromotion = (reservationId: string, reason: string) => Promise<{ ok?: boolean; error?: unknown }>;

export async function failPromotion(
  reservationId: string | undefined,
  failureCode: string,
  abortPromotion: AbortPromotion,
): Promise<Response> {
  if (!reservationId) {
    return Response.json({ ok: false, code: failureCode }, { status: 502 });
  }

  const reason = failureCode.slice(0, 200);
  try {
    const aborted = await abortPromotion(reservationId, reason);
    if (!aborted?.ok) {
      return Response.json({
        ok: false,
        code: "PROMOTION_CLEANUP_HOLD",
        original_failure: failureCode,
        reservation_id: reservationId,
        cleanup_error: aborted?.error ?? "ABORT_REJECTED",
      }, { status: 500 });
    }

    return Response.json({
      ok: false,
      code: failureCode,
      reservation_id: reservationId,
      cleanup: "ABORTED",
    }, { status: 502 });
  } catch {
    return Response.json({
      ok: false,
      code: "PROMOTION_CLEANUP_HOLD",
      original_failure: failureCode,
      reservation_id: reservationId,
      cleanup_error: "ABORT_RPC_FAILED",
    }, { status: 500 });
  }
}

// Gateway integration rule after reserve_github_promotion_v1 succeeds:
// - TARGET_PRECHECK_FAILED          -> failPromotion(...)
// - TARGET_WRITE_FAILED             -> failPromotion(...)
// - TARGET_READ_BACK_MISMATCH       -> failPromotion(...)
// - PROMOTION_FINALIZE_FAILED       -> failPromotion(...)
//
// Required invariant:
// No post-reservation failure may return while reservation status remains RESERVED.
// If abort itself cannot be proven, fail closed as PROMOTION_CLEANUP_HOLD.
