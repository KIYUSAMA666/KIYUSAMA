# KIYUSAMA OS — CARROT TRIGGER PRE-PAYMENT CHECKLIST

Date: 2026-08-21
Status: READY_BEFORE_PAYMENT

## Already completed
- [x] CARROT TRIGGER design separated into WAKE/TRIGGER and CARROT/JUDGMENT layers.
- [x] GREEN/YELLOW/RED authority classes defined.
- [x] CARROT TEST 01 defined.
- [x] PASS evidence requirements defined.
- [x] Duplicate/stale/scope/fail-closed guardrails defined.
- [x] Evidence schema defined.
- [x] KUMO/Notion CARROT TEST LOG database created.
- [x] Existing Zapier route is preserved; no rebuild from zero.
- [x] PR #43 remains unmerged pending runtime evidence.

## Still blocked by payment/runtime
- [ ] OpenAI API billing enabled.
- [ ] Existing Zapier `2. Conversation` Retest succeeds.
- [ ] Gmail -> Zapier -> OpenAI one-round-trip produces real evidence.
- [ ] CARROT TEST 01 runs GREEN-only.
- [ ] Evidence is written to KUMO log.
- [ ] Negative vectors (duplicate/stale/missing evidence/RED/scope) are tested.
- [ ] PR #43 merge decision made from evidence.

## Stop rule
Do not claim PASS for any unchecked runtime item.
Do not rebuild the existing Zap while billing is the only known blocker.
