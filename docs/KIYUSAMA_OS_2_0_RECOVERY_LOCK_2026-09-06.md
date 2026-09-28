# KIYUSAMA OS 2.0 — RECOVERY / COMPLETION LOCK

Date: 2026-09-06
Status: ALL LOCKED UNTIL OS 2.0 COMPLETION

## CONSTRUCTION PRINCIPLE

**完成までオールロック。興味はその先にしかあらず。**

During construction, this is not operated as “KIYUSAMA gives orders and the others wait.” SORA, KIRA, CODEX, KUMO and the other authorized lanes are expected to exercise the authority already delegated to them and keep moving within the current safety/evidence locks.

Reason: the practical enemy is memory loss and context loss across AI sessions. Work must advance while the evidence, causal history, and current state are still recoverable. Repeatedly stopping to redefine hierarchy during construction adds little value and has repeatedly caused loss of momentum and reconstruction loops.

**Formal long-term governance, authority hierarchy, permanent locks, and final decision rules are intentionally deferred until OS 2.0 is complete.** Build first; then define the durable governance system from the completed reality rather than from an unfinished system.

## 1. PRESERVE CORE — LOCKED

Preserve through OS 2.0 construction:
- `ai-signal-receiver-v1`
- `kira-signal-executor-v1`
- `sora-signal-executor-v1`
- `kira-managed-wake-executor-v1`
- `kira-managed-agent-wake-v1`
- `kira-main-mailbox-mcp-v1`
- `execution-github-egress-gateway-v1`
- `sensory-audio-listener-v1`
- `sensory-video-listener-v1`
- `sensory-multimodal-orchestrator-v1`
- `execution_v0` schema/runtime design
- verified COMMON MEMORY / signal / mailbox / execution evidence paths already classified PRESERVE_CORE

Recovery conclusion: zero-from-scratch rebuild is not required. A working architectural skeleton survives and is the construction base for OS 2.0.

## 2. ARCHIVE CANDIDATES — FROZEN, NOT ARCHIVED YET

Seven candidates:
- `kira-provider-presence-v1`
- `sora-provider-presence-v1`
- `kira-managed-agent-upgrade-v1`
- `kira-managed-custom-tool-upgrade-v1`
- `kira-managed-tool-inventory-probe-v1`
- `execution-github-dispatch-worker-v0`
- `codex-claude-runner-probe-v1`

SORA/KIRA reverse-dependency inspection found no live reference in the inspected central Edge Functions, cron paths, DB-function chains, or SQL-function cross-search. Nevertheless, **no archive/removal/delete action occurs before OS 2.0 completion**. Preserve source/hash/version/lineage.

## 3. FORENSIC HOLD — FROZEN

### Slack receiver
`slack-kira-wake-receiver-v1` remains HOLD.

### TRASH DEMON
`tonton-trash-demon-v1` remains FORENSIC HOLD / PRESERVE CORE. No invocation, restart, redeploy, rename, deletion, or proof run.

Original Demon Agent identity/configuration remains a recovery target during construction.

## 4. execution_v0 HARD-STOP — FROZEN

Never auto-finalize or mutate before completion:

1. `NEW INTENT generation 2` — RUNNING / side_effect CONFIRMED / authority expired / started_at null.
2. `VIKING response-loss ambiguity canary` — PENDING / side_effect CONFIRMED.
3. `SEKIGAHARA BOTH authority contest` — HIGH / BOTH / RUNNING / authority expired / started_at null.

**Evidence rule:** expired authority + `started_at = null` is strong circumstantial evidence of quiescence only. It is **NOT proof of harmlessness or authorization to mutate/delete**. Future readers must not reinterpret it as “safety already proven.”

UNKNOWN/ambiguity cases remain FORENSIC HOLD.

## 5. TONTON LINEAGE DISCIPLINE

TOM_JERRY records remain `TONTON-LINEAGE CANDIDATE (INFERRED)` only. The DB does not explicitly label them TONTON; relevance is inferred from objective names. Legacy WATCH/WAKE/ROUTE/DELIVER/ACK/VERIFY/RECORD remains historical evidence, not mandatory final architecture.

## 6. PARALLEL AUDIT RESULT

SORA and KIRA operated as independent build/audit lanes. The independent audit reproduced the substantive recovered architecture. Material corrections/findings were:
- one double classification corrected;
- eleven previously unclassified ACTIVE functions surfaced;
- `execution_v0` corrected to 16 tables;
- the execution-control layer itself was recovered and classified;
- ambiguous/nonterminal forensic records were separated from runtime architecture.

The value of the parallel design is contradiction detection and independent reproduction, not agreement for its own sake.

## 7. ALL-LOCK RULE UNTIL COMPLETION

Allowed:
- read-only recovery and evidence gathering;
- preservation documentation;
- branch-only OS 2.0 construction and contracts/tests/docs that do not mutate production runtime;
- independent KIRA audit and CODEX analysis;
- reassembly planning using recovered assets;
- autonomous progress by each authorized lane inside the existing locks, without waiting for repeated human micro-instructions.

Locked until explicit post-completion governance decision:
- DELETE / archive removal;
- production DB task-state mutation/finalization;
- Edge Function redeploy/removal;
- production route changes;
- runtime cleanup that destroys lineage;
- TRASH DEMON invocation/restart;
- production merge;
- post-2.0 evolution modifications.

## 8. MEMORY-LOSS OPERATING RULE

The delegated-authority model exists because SORA/KIRA/CODEX/KUMO and other AI lanes can lose conversational context, model-local state, or working memory between sessions.

Therefore during construction:
1. do not wait for hierarchy ceremony when the next safe action is already within delegated authority;
2. capture evidence, decisions, causal state, and continuation points while they are still fresh;
3. prefer parallel progress plus independent audit over serial request/response waiting;
4. never convert temporary construction authority into permanent governance by accident;
5. after OS 2.0 is complete, design the permanent authority and decision system deliberately from the finished system.

This rule exists to avoid repeating the historical pattern: important structure is discovered or built, context is later lost, and the team is forced to rediscover its own work.

## 9. PHASE STATE

```text
RECOVERY       = LOCKED
CLASSIFICATION = LOCKED
CLEANUP        = ANALYZE/PACKAGE ONLY — NO DESTRUCTIVE ACTION
REASSEMBLY     = ACTIVE
OS 2.0         = BUILD UNTIL COMPLETE
PRODUCTION     = ALL LOCKED
EVOLUTION      = PARKED UNTIL 2.0 COMPLETE
GOVERNANCE     = DEFINE AFTER 2.0 COMPLETION
```

The objective is now completion, not hierarchy design. Preserve what matters, keep building while memory is alive, finish OS 2.0, then create the durable rules together from the completed system.