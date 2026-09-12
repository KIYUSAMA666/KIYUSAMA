# EXCALIBUR IMPLEMENTATION CHECKPOINT V3

Goal: IMPLEMENTATION COMPLETE VERSION

## Implemented on isolated reversible branch
- Fail-closed post-reservation cleanup helper.
- Explicit post-reservation failure taxonomy.
- Attack/regression contract for cleanup paths.
- Stale RESERVED detector/reaper design that requires reconciliation and never blindly retries external mutation.

## Already verified live controls
- Legacy execution-github-dispatch-worker-v0 returns 410 LEGACY_WORKER_DISABLED.
- Replacement execution-github-egress-gateway-v1 is active.
- Promotion E2E GitHub read-back matched recorded blob SHA.
- main ruleset is active, PR required, no bypass actors.
- DB promotion reservation freezes generation and worker reassignment while RESERVED.

## Remaining before production COMPLETE
- Integrate cleanup helper semantics into deployed gateway.
- Prove all four post-reservation failure cases with controlled tests.
- Prove cleanup failure => HOLD/audit evidence.
- Add reconciler for stale RESERVED with external read-back before terminal decision.
- Re-run generation/worker/response-loss attacks against integrated version.
- Independent evidence seal and observer-boundary tests.

No invalid historical baseline hash is used by this checkpoint.
