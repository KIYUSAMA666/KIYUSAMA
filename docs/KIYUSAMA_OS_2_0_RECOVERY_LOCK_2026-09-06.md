# KIYUSAMA OS 2.0 — RECOVERY LOCK

Date: 2026-09-06
Authority: KIYUSAMA
Status: RECOVERY LOCKED / CLEANUP PREP

## Decision

The recovery phase is locked on the basis of independent SORA/KIRA read-only audit.

This LOCK does NOT authorize runtime deletion, task mutation, redeploy, restart, TRASH DEMON invocation, or PR merge.

## 1. PRESERVE CORE — LOCKED

The following recovered assets are accepted as OS 2.0 rebuild foundations and must be preserved through cleanup:

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
- existing verified COMMON MEMORY / signal / mailbox / execution evidence paths already classified PRESERVE_CORE in the recovery ledger

Recovery conclusion: zero-from-scratch rebuild is not required. A working architectural skeleton survives and will be reused during OS 2.0 reassembly.

## 2. ARCHIVE CANDIDATES — LOCKED AS PRESERVE-BEFORE-ARCHIVE

The following seven components are classified ARCHIVE-CANDIDATE after SORA/KIRA reverse-dependency inspection found no live reference from the inspected central Edge Functions, pg_cron jobs, DB function chains, or SQL-function definition cross-search:

- `kira-provider-presence-v1`
- `sora-provider-presence-v1`
- `kira-managed-agent-upgrade-v1`
- `kira-managed-custom-tool-upgrade-v1`
- `kira-managed-tool-inventory-probe-v1`
- `execution-github-dispatch-worker-v0`
- `codex-claude-runner-probe-v1`

LOCK meaning: preserve slug/version/hash/source/lineage first. Archive is permitted only in a later cleanup action after the preservation package is complete. Delete is NOT authorized by this file.

## 3. HOLD — LOCKED

### Slack receiver
- `slack-kira-wake-receiver-v1` remains HOLD.
- It is a fully implemented scoped Slack ingest receiver but has zero recorded events in its dedicated event table.
- Neither KEEP nor ARCHIVE is authorized yet.

### TRASH DEMON
- `tonton-trash-demon-v1` remains FORENSIC HOLD / PRESERVE CORE.
- No invocation, restart, redeploy, rename, or deletion.
- Original Demon Agent identity/configuration remains a recovery target.

## 4. execution_v0 HARD-STOP — LOCKED

The following three records must not be automatically finalized or mutated:

1. `NEW INTENT generation 2`
   - RUNNING
   - side_effect_status = CONFIRMED
   - authority expired
   - started_at = null

2. `VIKING response-loss ambiguity canary`
   - PENDING
   - side_effect_status = CONFIRMED

3. `SEKIGAHARA BOTH authority contest`
   - HIGH risk
   - route_policy = BOTH
   - RUNNING
   - authority expired
   - started_at = null

Expired authority and null started_at support quiescence but do not by themselves authorize state mutation.

Additional ambiguity/UNKNOWN cases remain FORENSIC HOLD as recorded in `docs/EXECUTION_V0_TRIAGE_2026-09-06.md`.

## 5. TONTON LINEAGE DISCIPLINE

TOM_JERRY records are `TONTON-LINEAGE CANDIDATE (INFERRED)` only.

The database does not explicitly label them TONTON. Their relevance is inferred from objective names such as WAKE BRIDGE, autonomous wake canary, and KIRA -> SORA. Do not promote this inference to primary fact without stronger evidence.

Legacy WATCH/WAKE/ROUTE/DELIVER/ACK/VERIFY/RECORD remains historical evidence and is not the final OS 2.0 architecture by default.

## 6. CLEANUP GATE

Next phase is CLEANUP PREP, not evolution.

Allowed next work:
- create preservation packages for archive candidates
- prove dependency absence more deeply where necessary
- separate historical records from current runtime state
- design non-destructive cleanup plan
- continue recovery of original Demon Agent / living-heart lineage
- update OS 2.0 assembly documents to use recovered core assets

Still forbidden without a later explicit execution decision:
- DELETE
- task status UPDATE/finalization
- Edge Function redeploy/removal
- production route changes
- TRASH DEMON invocation
- PR merge
- post-2.0 evolution work

## 7. PHASE STATE

```text
RECOVERY       = LOCKED
CLASSIFICATION = LOCKED
CLEANUP        = PREP / NON-DESTRUCTIVE
REASSEMBLY     = READY TO CONTINUE IN PARALLEL
OS 2.0 LOCK    = NOT YET
EVOLUTION      = PARKED
```
