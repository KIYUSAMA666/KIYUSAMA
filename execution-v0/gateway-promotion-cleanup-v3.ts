// KIYUSAMA OS execution_v0 — promotion cleanup v3
// Reversible implementation branch; production deployment is separate.

type AbortResult = { ok?: boolean; error?: unknown; status?: string };
type AbortPromotion = (reservationId: string, reason: string) => Promise<AbortResult>;

export async function failPromotion(
  reservationId: string | undefined,
  failureCode: string,
  abortPromotion: AbortPromotion,
): Promise<Response> {
  if (!reservationId) {
    return Response.json({ ok: false, code: failureCode }, { status: 502 });
  }

  try {
    const aborted = await abortPromotion(reservationId, failureCode.slice(0, 200));
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
      cleanup: aborted.status ?? "ABORTED",
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

export const POST_RESERVATION_FAILURES = [
  "TARGET_PRECHECK_FAILED",
  "TARGET_WRITE_FAILED",
  "TARGET_READ_BACK_MISMATCH",
  "PROMOTION_FINALIZE_FAILED",
] as const;

// Invariant: once reserve_github_promotion_v1 succeeds, no failure path may
// return while the reservation remains RESERVED. Cleanup uncertainty fails closed.
