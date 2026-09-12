# GitHub Promotion Reconciler V1 — Attack Contract

1. Read-back error -> HOLD; zero target writes; zero blind retries.
2. Target blob == staged blob -> finalize with authoritative commit/blob evidence.
3. Finalize returns ALREADY_CONFIRMED -> CONFIRMED idempotently.
4. Finalize failure after matching read-back -> HOLD.
5. Target absent after previously absent target -> ABORT; SAFE_RETRY_ELIGIBLE.
6. Target blob == captured pre-write blob -> ABORT; SAFE_RETRY_ELIGIBLE.
7. Target blob differs from staged and pre-write blob -> HOLD.
8. No pre-write identity + ambiguous present target -> HOLD.
9. Reconciler never writes GitHub target content.
10. Generation/worker validity remains enforced by DB reservation/finalize controls.
11. A stale RESERVED row is not sufficient evidence for ABORT.
12. External read-back is mandatory before resolving mutation uncertainty.
