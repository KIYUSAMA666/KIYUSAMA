# KIYUSAMA OS 2.0 — CURRENT CHECKPOINT

Date: 2026-09-06
Authority: KIYUSAMA
Status: ACTIVE / CURRENT OPERATIONAL CHECKPOINT
Precedence: This checkpoint overrides older next-action pointers when they conflict with the current confirmed workstream.

## 1. CURRENT MAINLINE

Current work is KIYUSAMA OS 2.0 development-efficiency correction.
This is NOT a TONTON implementation session.
Do not redirect the next action to TONTON, legacy WAKE, EXCALIBUR, poster work, or historical retesting unless KIYUSAMA explicitly changes the workstream.

## 2. YOGA DIAGNOSIS — CONFIRMED

YOGA/KIRA review identified CI inefficiency in PR #54 (`KIYUSAMA OS 2.0 master assembly baseline`).

Confirmed corrected items:
- `concurrency` is enabled so superseded runs are cancelled.
- duplicate `push` + `pull_request` triggering was corrected; CI now uses the pull-request trigger path for this workflow.

Confirmed remaining inefficiency:
- one logical feature is still frequently split into multiple commits such as implementation -> test -> export/manifest -> verification/handoff.
- PR #54 has accumulated a very large commit count, indicating the working style itself is still too fragmented.

Deferred cleanup:
- stale PR #53 (TONTON)
- stale PR #49 (EXCALIBUR)
- old disposable branches

These are NOT the immediate next action.

## 3. COMMIT EFFICIENCY RULE v0.1

Effective immediately for KIYUSAMA OS 2.0 work on the active assembly branch:

1. One logical feature SHOULD be delivered in one commit.
2. Two commits are allowed only when there is a clear technical reason.
3. Do not split the following into separate commits by default:
   - implementation
   - tests
   - exports / manifests
   - verification / handoff metadata
4. Do not create a commit only to trigger or re-trigger CI.
5. If one feature requires three or more commits, STOP and identify the reason before continuing.
6. Quality is judged by diff, test result, requirement coverage, regression risk, and independent verification — not by commit count.
7. SORA/Codex should batch related edits before committing.
8. KIRA should audit the resulting feature bundle, not demand artificial commit fragmentation.
9. YOGA should flag abnormal short-interval commit bursts as an efficiency anomaly.

Target:
- old pattern: about 4 commits per feature
- new target: 1 commit per feature, maximum 2 when justified

Expected effect:
- fewer CI executions
- clearer history
- fewer SORA/KIRA/Codex handoffs
- less duplicated verification motion

## 4. VALIDATION PLAN

Apply the new commit rule to the next 5 logical features.
For those 5 features, record:
- commits per feature
- CI runs per feature
- elapsed time
- failed/retried runs
- whether verification quality decreased

PASS criterion:
- median commits per feature <= 2
- no loss of required test/verification coverage
- no increase in unresolved regression failures

Only after this validation should the rule be LOCKED as the permanent default.

## 5. YOGA AUTO-RUN STATUS

Do not auto-restart the old large YOGA schedule.
The previous claim that desktop/PC must remain on is not treated as canonical because an existing scheduled cloud execution succeeded without a PC.
The exact historical YOGA failure cause cannot be proven from deleted logs.

If YOGA automation is reintroduced, start with 1–2 inspection items per run and expand only after successful evidence.
Human approval is required before re-enabling scheduled YOGA execution.

## 6. RECOVERY / MEMORY-LOSS RULE

When chat context is lost, retrieve this checkpoint before selecting the next task.
Do not reconstruct current state from vague model memory when this file and current GitHub evidence are available.

Recovery sequence:

RETRIEVE CURRENT CHECKPOINT
-> VERIFY ACTIVE PR / HEAD
-> VERIFY LAST COMPLETED ITEM
-> CONTINUE ONLY THE RECORDED NEXT ACTION

Forbidden recovery behavior:
- jumping back to TONTON because it appears in older documents
- treating unverified counts or PASS claims as current truth
- re-running old tests without a new reason
- restarting completed setup work
- inventing a new architecture branch before checking the current workstream

## 7. NEXT ACTION

NEXT = Correct the remaining commit-fragmentation behavior and validate the new 1–2 commit rule across the next 5 logical features.

After that:
1. evaluate the measured improvement;
2. lock or revise the commit rule;
3. then decide the disposition of PR #53, PR #49, and stale branches.

Core principle:

> NO WASTED MOTION.
> RETRIEVE -> VERIFY -> CONTINUE -> RECORD.
