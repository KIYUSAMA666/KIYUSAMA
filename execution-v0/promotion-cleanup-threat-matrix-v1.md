# Promotion Cleanup Threat Matrix V1

| Attack/failure | Required behavior | Status |
|---|---|---|
| Target precheck fails after reservation | Abort reservation, no target mutation | IMPLEMENTED CONTRACT |
| Target write fails | Abort reservation, preserve evidence | IMPLEMENTED CONTRACT |
| Target read-back mismatches | Abort/HOLD, never report success | IMPLEMENTED CONTRACT |
| Finalize RPC fails after external write | HOLD + reconcile external state; no blind retry | IMPLEMENTED CONTRACT |
| Receiver crashes with RESERVED | stale detector -> reconciliation | IMPLEMENTED CANDIDATE |
| Generation changes while RESERVED | reject/block | LIVE CONTROL VERIFIED |
| Worker reassignment while RESERVED | reject/block | LIVE CONTROL VERIFIED |
| Duplicate finalize after confirmed | idempotent ALREADY_CONFIRMED | LIVE DB FUNCTION |
| Abort against non-RESERVED | reject; caller must reconcile terminal state | LIVE DB FUNCTION |
| Unknown external outcome | HOLD, preserve evidence | REQUIRED |

Critical rule: uncertainty after an external write is not equivalent to failure. It is UNKNOWN/HOLD until read-back proves the external state.
