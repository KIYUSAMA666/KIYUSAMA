# KIYUSAMA OS 2.0 / TONTON — PHASE 1 CONTRACT BASELINE FREEZE

**Freeze date:** 2026-09-06
**Authority:** KIYUSAMA — FINAL APPROVED
**Scope:** TONTON PHASE 1 Contract baseline only
**Branch:** `sora/os2-contract-code-freeze-20260905`

## FORMAL FREEZE DECISION

**CONTRACT BASELINE = FORMALLY FROZEN**

KIYUSAMA has issued FINAL APPROVAL after SORA implementation, KIRA independent audit, independent GitHub Actions evidence, and GitHub artifact reconciliation.

This freeze records the approved baseline. It is not approval to merge to `main`, deploy to production, connect production providers, or modify the locked Contract silently.

## APPROVED IMPLEMENTATION BASELINE

Audited implementation commit:

`08ce01632bd545e03f63907c88ae8c8a715ba6a8`

KIRA FINAL PASS record commit:

`53aef4fbcef55550d8816f613803c03bd29e543e`

KIRA FINAL PASS document:

`docs/KIRA_FINAL_PASS_PHASE1_2026-09-05.md`

Independent CI evidence:

- GitHub Actions run: `33968827942`
- Result: `completed / success`
- Total tests: `26`
- Pass: `26`
- Fail: `0`
- Cancelled: `0`
- Skipped: `0`

## LOCKED CONTRACT SCOPE

TONTON Contract baseline consists of 7/7 functions:

1. WATCH
2. WAKE
3. ROUTE
4. DELIVER
5. ACK
6. VERIFY
7. RECORD

KIRA-audited fixes included in the approved baseline:

- PATCH A — DeliveryEnvelope `ttl` restored
- PATCH B — delivery state transitions use allow-list / default-deny behavior
- PATCH C — VerificationStatus extended with `VERIFY_TIMEOUT`, `VERIFY_EXPIRED`, `FROZEN`
- `delivery_attempt_id` alignment for ACK/retry correlation
- `SPOOF_DETECTED` made reachable from `AUTHORIZED` only
- independent verification remains required before final VERIFIED
- executor adapter cannot final-VERIFY itself

## GOVERNANCE LOCK

From this freeze forward:

- No silent edits to the approved Contract baseline.
- Any Contract change requires a new PATCH/version and fresh evidence.
- SORA may implement but may not self-approve.
- Independent verification evidence remains mandatory for final success claims.
- KIYUSAMA remains Human Root Authority for promotion / important policy decisions.
- `main` merge is a separate decision and is NOT included in this freeze.
- Production promotion is NOT included in this freeze.
- Legacy TONTON remains in RIVER / QUARANTINE unless separately approved for migration.

## EVIDENCE LINEAGE

`SORA IMPLEMENTED`
→ `KIRA INDEPENDENT AUDIT`
→ `PATCH / RE-AUDIT`
→ `GitHub Actions 33968827942 — 26/26 PASS`
→ `KIRA FINAL PASS`
→ `GitHub artifact reconciliation`
→ `KIYUSAMA FINAL APPROVED`
→ **`CONTRACT BASELINE FORMALLY FROZEN`**

## NEXT AUTHORIZED IMPLEMENTATION ORDER

The approved next sequence is fixed as:

1. **Legacy Codex Adapter Wrapper**
2. **CLEAN ROOM — first isolated end-to-end TONTON path**

No PHASE 1 redesign, re-audit, explanatory-document rebuild, old-environment rebuild, or `main` merge is authorized as an automatic prerequisite.

## CORE PRINCIPLES

MODEL IS REPLACEABLE.
STATE IS EXTERNAL.
EVIDENCE BEFORE MEMORY.
HUMAN DECIDES.

---

**Status: PHASE 1 CONTRACT BASELINE — FROZEN ✅**
