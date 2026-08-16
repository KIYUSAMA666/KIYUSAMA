# SORA × CODEX BUILDER REVIEW — PLAN C / TRACK B

Status: REVIEW ONLY. NO DEPLOY. NO MIGRATION. NO SECRET CHANGE. NO PERMISSION CHANGE. NO PRODUCTION DB WRITE.

## Goal
Independently review KIYUSAMA OS ZERO-FOLLOW-UP disconnect and produce the smallest safe implementation diff plus test plan.

## Track A — Plan C
Known verified facts from Supabase runtime:
- `trg_50_emit_ai_signal_v1` is AFTER INSERT on `common_memory.agent_messages`.
- `emit_ai_signal_v1` emits only when inserted row status = `NEW`; non-NEW returns immediately.
- `kira_executor_reply_v1` sets child status to `NEW` iff `(src.hop_count + 1) < src.max_hops`, otherwise `REPLIED`.
- `sora_executor_reply_v1` currently inserts child reply with status hard-coded to `REPLIED`.
- `enqueue_agent_message_v1` defaults `max_hops=1`.
- historical canary with `max_hops=4` chained SORA -> KIRA -> SORA, then stopped on SORA reply because `forward_signal_emitted=false`.
- claim RPCs require `status='SIGNAL_RECEIVED'`.
- `agent_messages_one_reply_per_parent_agent_uq(parent_message_id, from_agent)` prevents duplicate same-agent reply per parent.
- hop_count/max_hops are DB bounded (0..8).

Builder task:
1. Identify the minimal code/database diff to make SORA reply state symmetric with KIRA:
   `reply_status = ((src.hop_count + 1) < src.max_hops) ? 'NEW' : 'REPLIED'`.
2. Prefer changing only the actual decision point (`common_memory.sora_executor_reply_v1`) unless source inspection proves Edge Function changes are necessary.
3. Verify no new signal-emitter path is introduced; `trg_50_emit_ai_signal_v1` must remain the sole signal emitter.
4. Check race conditions, claimability, idempotency, retry bookkeeping, circuit breaker, DLQ, stale recovery interaction.
5. Produce exact minimal diff proposal, rollback plan, and non-destructive canary test for `max_hops=4` proving SORA->KIRA->SORA->KIRA with final-only terminal `REPLIED`.

## Track B — EXECUTE privilege boundary
Verified current state:
- `common_memory.sora_executor_reply_v1` has default/PUBLIC EXECUTE exposure.
- `public.sora_executor_reply_v1` ACL includes PUBLIC, anon, authenticated, service_role; it is a thin SECURITY DEFINER wrapper around the common_memory function.
- SORA Edge runtime uses a service-role Supabase client to call `rpc('sora_executor_reply_v1')`.
- DB function search found no common_memory/internal caller other than the public wrapper.
- GitHub connector code-search index is currently unavailable, so absence of other frontend callers is not yet fully proven.

Builder task:
1. Search the entire repository/workspace for direct calls to `sora_executor_reply_v1` and `/rpc/sora_executor_reply_v1`.
2. List every caller with file/path and runtime identity (service role, anon, authenticated, other).
3. If service_role is the only real caller, propose the minimal hardening:
   - revoke EXECUTE on both public and common_memory functions from PUBLIC/anon/authenticated/non-required roles;
   - retain/grant EXECUTE only where required for current Edge behavior.
4. Do NOT apply REVOKE/GRANT. Produce proposal only.
5. Identify any compatibility break if privileges are narrowed.

## Required output
A. FACTS VERIFIED FROM CODE
B. TRACK A PLAN C VERDICT
C. TRACK B CALLER INVENTORY
D. MINIMAL DIFF PROPOSAL
E. SECURITY/RACE RISKS
F. CANARY TEST PLAN
G. ROLLBACK
H. BLOCKERS/UNKNOWN
I. RECOMMENDED ORDER

## Approval boundary
KIYUSAMA is the sole approver for production mutation. No implementation, deploy, migration, secret change, permission change, or production DB write in this review task.
