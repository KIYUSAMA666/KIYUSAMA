# Promotion Cleanup V3 — Attack/Regression Contract

Status: IMPLEMENTED ON REVERSIBLE BRANCH / NOT PRODUCTION DEPLOYED

Required cases:

1. Failure before reservation: no abort call required.
2. TARGET_PRECHECK_FAILED after reservation: abort exactly once.
3. TARGET_WRITE_FAILED after reservation: abort exactly once.
4. TARGET_READ_BACK_MISMATCH after reservation: abort exactly once.
5. PROMOTION_FINALIZE_FAILED after reservation: abort exactly once.
6. Abort returns ok=false: fail closed as PROMOTION_CLEANUP_HOLD.
7. Abort RPC throws: fail closed as PROMOTION_CLEANUP_HOLD.
8. Repeated cleanup against non-RESERVED reservation must never be reported as successful cleanup unless DB confirms terminal state.
9. CONFIRMED reservation must never be converted to ABORTED.
10. Postcondition for every post-reservation failure: RESERVED count for that reservation = 0, or explicit HOLD with audit evidence.

Production integration target: execution-github-egress-gateway-v1.
Existing DB primitive: execution_v0.abort_github_promotion_v1.
