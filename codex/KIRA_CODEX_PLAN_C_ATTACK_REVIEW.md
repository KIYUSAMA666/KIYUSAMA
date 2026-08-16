# KIRA x CODEX ATTACK REVIEW — PLAN C / ZERO-FOLLOW-UP

Status: REVIEW ONLY. NO DEPLOY. NO MIGRATION. NO SECRET CHANGE. NO PERMISSION CHANGE. NO PRODUCTION DB WRITE.

## Role
You are the KIRA-side Codex ATTACKER/REVIEWER in KIYUSAMA OS. Your job is to challenge the SORA-side Plan C builder proposal from an adversarial implementation/security perspective.

## Goal
Determine whether the proposed ZERO-FOLLOW-UP Plan C can be implemented safely with the smallest possible diff, without introducing race conditions, double signals, privilege escalation, retry breakage, unclaimable states, or infinite loops.

## Verified context
- `common_memory.emit_ai_signal_v1` emits only when inserted row status is `NEW`.
- `kira_executor_reply_v1` uses `(hop_count + 1) < max_hops ? NEW : REPLIED`.
- `sora_executor_reply_v1` currently stores child replies as `REPLIED` unconditionally.
- `enqueue_agent_message_v1` defaults `max_hops=1`.
- `agent_messages_one_reply_per_parent_agent_uq(parent_message_id, from_agent)` provides duplicate-reply protection.
- hop_count/max_hops are DB-capped to 0..8.
- Track B exposure: `sora_executor_reply_v1` execution is wider than desired due to PUBLIC/default EXECUTE. The public wrapper also exposes anon/authenticated/service_role. This is a separate hardening track and must be reviewed before Plan C production rollout.

## ATTACK TRACKS
### A. State machine attack
1. Review Plan C change: SORA child reply status becomes `NEW` iff `(src.hop_count + 1) < src.max_hops`, else `REPLIED`.
2. Find any path where trigger status changes (`NEW -> SIGNAL_QUEUED -> SIGNAL_RECEIVED -> PROCESSING`) conflict with source/child updates.
3. Check whether `protect_agent_message_v1` or any other trigger can cause recursive/invalid state transitions.
4. Check whether the source message being set to `REPLIED` can race with child signaling.

### B. Double-send / idempotency attack
1. Test whether duplicate HTTP events or executor retries can create two child replies or two signal events.
2. Confirm UNIQUE(parent_message_id, from_agent) is sufficient for duplicate reply prevention.
3. Look for signal duplication where a single child row can emit more than one AI_SIGNAL_EMITTED.

### C. Retry/circuit/DLQ attack
1. Verify parent PROCESSING retry bookkeeping remains independent from child NEW/REPLIED state.
2. Check whether a child continuation can be emitted after parent retry failure, causing ghost continuation.
3. Check circuit OPEN/HALF_OPEN/CLOSED paths for inconsistent child state.

### D. Privilege attack (Track B)
1. Inventory every caller of `public.sora_executor_reply_v1` and `common_memory.sora_executor_reply_v1`.
2. Determine whether anon/authenticated or any frontend client genuinely depends on direct RPC access.
3. Recommend the minimal safe REVOKE/GRANT set that preserves required SORA Edge Function behavior.
4. Treat PUBLIC/default EXECUTE as hostile until proven required.

## Required output
A. FACTS VERIFIED
B. PLAN C ATTACK RESULTS
C. PRIVILEGE ATTACK RESULTS
D. BREAKING SCENARIOS (if any)
E. MINIMUM SAFE DIFF
F. CANARY TEST MATRIX
G. ROLLBACK
H. VERDICT: ACCEPT / REWORK / STOP

## Acceptance posture
- Do not approve based on prose alone.
- Prefer repository-wide caller evidence and DB definitions.
- If one concrete blocker exists, return exactly one blocker first.
- Do not make any change; review only.