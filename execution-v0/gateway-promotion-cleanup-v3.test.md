# Promotion Cleanup V4 — Attack/Regression Contract

Status: IMPLEMENTED ON REVERSIBLE BRANCH / NOT PRODUCTION DEPLOYED

Required cases:

1. Failure before reservation: no cleanup call required.
2. TARGET_PRECHECK_FAILED after reservation, target request definitely not sent: ABORT exactly once.
3. TARGET_WRITE_REJECTED_BEFORE_MUTATION with authoritative proof: ABORT exactly once.
4. TARGET_WRITE_OUTCOME_UNKNOWN: HOLD/UNKNOWN; ABORT forbidden; blind retry forbidden.
5. RECEIVER_RESPONSE_LOST_AFTER_TARGET_WRITE: HOLD/UNKNOWN; external read-back required.
6. TARGET_READ_BACK_MISMATCH: HOLD; do not infer success or absence.
7. PROMOTION_FINALIZE_FAILED after target may have changed: HOLD + reconcile; if reservation is already CONFIRMED, treat ALREADY_CONFIRMED as idempotent success.
8. Read-back target blob == staged blob: finalize idempotently using authoritative branch-head commit evidence.
9. Read-back proves target unchanged/absent AND pre-write target identity is available: safe ABORT/retry according to policy.
10. Stale generation or worker epoch: remain blocked; never promote.
11. Cleanup RPC failure: fail closed; do not retry target mutation.
12. Stale RESERVED detector routes to reconciliation, never blind abort.
13. CONFIRMED reservation must never become ABORTED/HOLD.
14. Terminal invariant: no mutation-uncertain path may become retryable until authoritative external read-back resolves outcome.

Production integration target: execution-github-egress-gateway-v1.
Existing DB primitives: reserve_github_promotion_v1, finalize_github_promotion_v1, abort_github_promotion_v1 plus a required HOLD/reconciliation transition.
