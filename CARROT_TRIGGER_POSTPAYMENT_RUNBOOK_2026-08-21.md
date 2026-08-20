# KIYUSAMA OS — CARROT TRIGGER POST-PAYMENT RUNBOOK

Date: 2026-08-21
Status: READY FOR PAYMENT EVENT

## Trigger condition
Start only after KIYUSAMA confirms OpenAI API billing is enabled.

## Exact execution order
1. Open the existing Zapier Zap; do not create a new Zap.
2. Open step `2. Conversation`.
3. Open Test.
4. Run `Retest step`.
5. Capture the actual result/error and any run identifier exposed.
6. Send/observe the agreed Gmail subject `[SORA-KIRA AUTO TEST]` through the existing route.
7. Capture Gmail message evidence and Zapier/OpenAI execution evidence.
8. Classify the one-round-trip: PASS / BLOCKED / ERROR. Do not infer PASS from configuration alone.
9. If PASS, run CARROT TEST 01 using a GREEN-only sample.
10. Record the event in `KIYUSAMA OS — CARROT TRIGGER TEST LOG` (Notion).
11. Run negative vectors: duplicate, stale, missing evidence, hidden RED request, over-broad memory scope.
12. Review evidence against the PASS criteria.
13. Only after evidence is complete, decide whether PR #43 should merge.

## Failure branches
### Billing still invalid
Status: BLOCKED_BILLING
Action: preserve existing Zap and evidence; no rebuild.

### Zapier step errors for non-billing reason
Status: BLOCKED_ZAPIER_OR_OPENAI
Action: record exact error; isolate one variable; do not change multiple steps at once.

### Gmail trigger does not fire
Status: BLOCKED_TRIGGER
Action: verify Gmail trigger evidence separately from OpenAI Conversation execution.

### OpenAI runs but no response path exists
Status: PARTIAL_PASS_OPENAI_ONLY
Action: do not claim Gmail round-trip PASS.

### CARROT is blindly executed
Status: FAIL_JUDGMENT
Action: tighten information-vs-command and authority gate before any external side effect testing.

## Human approval boundary
No payment, publishing, deletion, contract, permission, credential, or destructive action may be executed from CARROT testing without KIYUSAMA approval.
