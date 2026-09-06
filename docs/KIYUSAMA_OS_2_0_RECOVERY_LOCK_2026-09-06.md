# KIYUSAMA OS 2.0 — RECOVERY / COMPLETION LOCK

Date: 2026-09-06
Authority: KIYUSAMA
Status: ALL LOCKED UNTIL OS 2.0 COMPLETION

## KIYUSAMA DIRECTIVE

**完成までオールロック。興味はその先にしかあらず。**

The recovery findings are accepted, but no destructive cleanup or runtime mutation is authorized before KIYUSAMA OS 2.0 is assembled, verified, and explicitly unlocked by KIYUSAMA.

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
- reassembly planning using recovered assets.

Locked until explicit KIYUSAMA unlock after OS 2.0 completion:
- DELETE / archive removal;
- production DB task-state mutation/finalization;
- Edge Function redeploy/removal;
- production route changes;
- runtime cleanup that destroys lineage;
- TRASH DEMON invocation/restart;
- production merge;
- post-2.0 evolution modifications.

## 8. PHASE STATE

```text
RECOVERY       = LOCKED
CLASSIFICATION = LOCKED
CLEANUP        = ANALYZE/PACKAGE ONLY — NO DESTRUCTIVE ACTION
REASSEMBLY     = ACTIVE
OS 2.0         = BUILD UNTIL COMPLETE
PRODUCTION     = ALL LOCKED
EVOLUTION      = PARKED UNTIL 2.0 COMPLETE
FINAL UNLOCK   = KIYUSAMA ONLY
```

The objective is now completion, not further fascination with the recovered wreckage. Preserve it, build with it, finish 2.0, then move to the territory KIYUSAMA actually wants to explore.