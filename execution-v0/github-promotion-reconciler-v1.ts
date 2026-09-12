// KIYUSAMA OS — pure fail-closed GitHub promotion reconciler candidate.
// No direct network/DB dependency: adapters are injected for controlled testing.

type ReadBack =
  | { kind: "PRESENT"; blobSha: string; commitSha: string }
  | { kind: "ABSENT" }
  | { kind: "ERROR"; reason: string };

type Reservation = {
  reservationId: string;
  branch: string;
  targetPath: string;
  stagedBlobSha: string;
  preWriteTargetBlobSha?: string | null;
};

type Ops = {
  readTarget: (branch: string, path: string) => Promise<ReadBack>;
  finalize: (reservationId: string, commitSha: string, blobSha: string) => Promise<{ok:boolean; code?:string}>;
  abort: (reservationId: string, reason: string) => Promise<{ok:boolean; code?:string}>;
  hold: (reservationId: string, reason: string) => Promise<{ok:boolean; code?:string}>;
};

export async function reconcileGithubPromotion(r: Reservation, ops: Ops) {
  const rb = await ops.readTarget(r.branch, r.targetPath);
  if (rb.kind === "ERROR") {
    await ops.hold(r.reservationId, `READBACK_ERROR:${rb.reason}`.slice(0,200));
    return {ok:false, state:"HOLD", code:"READBACK_AMBIGUOUS"};
  }

  if (rb.kind === "PRESENT" && rb.blobSha === r.stagedBlobSha) {
    const f = await ops.finalize(r.reservationId, rb.commitSha, rb.blobSha);
    if (f.ok || f.code === "ALREADY_CONFIRMED") return {ok:true, state:"CONFIRMED"};
    await ops.hold(r.reservationId, `FINALIZE_RECONCILE_FAILED:${f.code ?? "UNKNOWN"}`);
    return {ok:false, state:"HOLD", code:"FINALIZE_RECONCILE_FAILED"};
  }

  // Safe absence/unchanged proof requires a pre-write identity.
  if (rb.kind === "ABSENT" && r.preWriteTargetBlobSha == null) {
    const a = await ops.abort(r.reservationId, "READBACK_PROVES_TARGET_ABSENT");
    return a.ok ? {ok:false,state:"ABORTED",code:"SAFE_RETRY_ELIGIBLE"} : {ok:false,state:"HOLD",code:"ABORT_FAILED"};
  }

  if (rb.kind === "PRESENT" && r.preWriteTargetBlobSha && rb.blobSha === r.preWriteTargetBlobSha) {
    const a = await ops.abort(r.reservationId, "READBACK_PROVES_TARGET_UNCHANGED");
    return a.ok ? {ok:false,state:"ABORTED",code:"SAFE_RETRY_ELIGIBLE"} : {ok:false,state:"HOLD",code:"ABORT_FAILED"};
  }

  await ops.hold(r.reservationId, "READBACK_MISMATCH_UNKNOWN_EXTERNAL_STATE");
  return {ok:false, state:"HOLD", code:"EXTERNAL_STATE_MISMATCH"};
}
