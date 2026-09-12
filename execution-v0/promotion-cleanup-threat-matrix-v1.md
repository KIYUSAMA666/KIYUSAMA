# Promotion Cleanup Threat Matrix V2

| Attack/failure | Required behavior | Status |
|---|---|---|
| Target precheck fails after reservation; request definitely not sent | ABORT reservation; no target mutation | IMPLEMENTED CONTRACT |
| Target write rejected before mutation with authoritative proof | ABORT reservation | IMPLEMENTED CONTRACT |
| Target PUT transport fails and send outcome is unknown | HOLD/UNKNOWN; ABORT forbidden | IMPLEMENTED CONTRACT |
| Receiver loses response after target PUT | HOLD/UNKNOWN; authoritative read-back | IMPLEMENTED CONTRACT |
| Target read-back equals staged blob | FINALIZE idempotently | IMPLEMENTED CONTRACT |
| Target read-back proves unchanged/absent using pre-write identity | safe ABORT/retry by policy | IMPLEMENTED CONTRACT |
| Target read-back mismatches expected staged and pre-write identities | HOLD; human/reconciler evidence required | IMPLEMENTED CONTRACT |
| Finalize RPC response lost after external write | reconcile; ALREADY_CONFIRMED is success | IMPLEMENTED CONTRACT |
| Receiver crashes with RESERVED | stale detector -> reconciliation | IMPLEMENTED CANDIDATE |
| Generation changes while RESERVED | reject/block | LIVE CONTROL VERIFIED |
| Worker reassignment while RESERVED | reject/block | LIVE CONTROL VERIFIED |
| Duplicate finalize after confirmed | idempotent ALREADY_CONFIRMED | LIVE DB FUNCTION |
| Abort against non-RESERVED | reject; reconcile terminal state | LIVE DB FUNCTION |
| Unknown external outcome | HOLD; preserve evidence; no blind retry | REQUIRED INTEGRATION |

Critical invariant: uncertainty after an external write is not failure. UNKNOWN/HOLD remains non-retryable until authoritative external read-back proves the state.
