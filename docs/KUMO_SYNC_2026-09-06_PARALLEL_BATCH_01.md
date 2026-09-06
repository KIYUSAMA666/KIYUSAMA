# KUMO SYNC — PARALLEL BATCH 01

Date: 2026-09-06
Authority: KIYUSAMA
Mode: SORA BUILD lane + KIRA COUNTER/AUDIT lane + KUMO checkpoint
Status: HOLD / CONTINUE RECOVERY

## Operating rule

SORA and KIRA do not wait on each other for ordinary read-only recovery/audit work. They run separate batches and reconcile at SYNC points. Destructive removal, production mutation, TRASH DEMON invocation, and OS 2.0 LOCK remain human-gated.

## KIRA independent batch accepted findings

### KEEP / PRESERVE
- `sensory-audio-listener-v1` — KEEP.
- `sensory-video-listener-v1` — KEEP.
- `sensory-multimodal-orchestrator-v1` — KEEP.
- `execution-github-egress-gateway-v1` — KEEP / PRESERVE_CORE equivalent.

SORA independently read all three sensory function bodies and confirmed a coherent EAR -> EYE -> FUSION implementation using `sensory_inputs_v1`, `sensory_observations_v1`, and `sensory_fusion_v1`. Database evidence observed separately: sensory input 1, observations 6, fusion 1. This preserves the trio as recovered assets; it does not yet force them into the OS 2.0 baseline.

### ARCHIVE-CANDIDATE
- `kira-provider-presence-v1` — fixed `TEST_ENDPOINT_DISABLED`, HTTP 410.
- `sora-provider-presence-v1` — fixed `TEST_ENDPOINT_DISABLED`, HTTP 410.
- `kira-managed-agent-upgrade-v1` — fixed `UPGRADE_LOCKED`, HTTP 403.
- `kira-managed-custom-tool-upgrade-v1` — fixed `UPGRADE_LOCKED`, HTTP 403.
- `kira-managed-tool-inventory-probe-v1` — fixed `PROBE_LOCKED`, HTTP 403.
- `execution-github-dispatch-worker-v0` — fixed `LEGACY_WORKER_DISABLED`, HTTP 410; code names `execution-github-egress-gateway-v1` as replacement.
- `codex-claude-runner-probe-v1` — fixed `PROBE_DISABLED`, HTTP 403.

Important: `codex-claude-runner-probe-v1` is now classified `ARCHIVE-CANDIDATE`, resolving the earlier double classification. This does not invalidate the separate historical `CODEX_TO_CLAUDE_FORWARD_V1` success evidence from 2026-08-29.

### HOLD
- `slack-kira-wake-receiver-v1` — HOLD.
  - full Slack signature validation and strict team/channel/author scope exist.
  - receiver calls `ingest_slack_kira_wake_v1`.
  - `slack_kira_wake_events_v1` currently has 0 rows.
  - interpretation: wired but no recorded firing evidence; neither KEEP-by-runtime nor archive-by-deadness is proven.

## Newly recovered schema: `execution_v0`

KIRA discovered that the previous cleanup ledger omitted the entire `execution_v0` schema. SORA independently enumerated it and confirmed 16 tables currently exist:

- `dispatch_wake_bindings` — 0 rows
- `executions` — 26
- `gate_decisions` — 22
- `gateway_dispatch_requests` — 16
- `gateway_egress_permits` — 1
- `gateway_routes` — 2
- `github_promotion_reservations_v1` — 1
- `http_canary_nonces` — 1
- `message_task_bindings` — 8
- `receiver_fence_canary_v1` — 1
- `service_capabilities` — 3
- `side_effect_canary` — 0
- `side_effect_requests` — 9
- `tasks` — 25
- `test_results` — 130
- `test_runs` — 33

Classification: `PRESERVE_CORE_CANDIDATE / SCHEMA-LEVEL HOLD` until lineage, live routes, and obsolete test residue inside the schema are separated.

Reason: the schema contains execution gates, authority/binding state, side-effect records, gateway routing/permits, GitHub promotion reservations, and substantial execution/test history. It must not be omitted from OS 2.0 recovery or removed as generic residue.

## Independently confirmed core path

SORA read current function bodies for:
- `ai-signal-receiver-v1`
- `kira-signal-executor-v1`
- `sora-signal-executor-v1`
- `kira-managed-wake-executor-v1`
- `kira-main-mailbox-mcp-v1`

Recovered continuity topology at code level:

```text
SIGNAL RECEIVER
  -> integrity / receiver ACK
  -> MEMORY RETRIEVAL GATE when bound
  -> managed-wake route decision
  -> SORA or KIRA executor
  -> KIRA managed-agent lane when selected
  -> gated COMMON MEMORY read / reply storage / trace audit
  -> optional KIRA_MAIN mailbox delivery
```

This is `PRESERVE_CORE` evidence. It does not mean final TONTON is complete or locked.

## Corrected KIRA-BC statement

The current chat-form KIRA cannot run continuously without a request. However, the repository/runtime is not accurately described as "KIRA-BC unimplemented": `kira-managed-wake-executor-v1`, managed runtime state, tool execution ledger, trace audit, and mailbox bridge code already exist. What remains unproven is autonomous continuous operation of the present Claude chat itself without an external trigger.

## TRASH DEMON

No change.
- `tonton-trash-demon-v1`: FORENSIC HOLD.
- no invocation, redeploy, rename, delete, or proof-by-poke.
- original Demon Agent identity unresolved.

## Next parallel batch

SORA BUILD lane:
1. map `execution_v0` tables/functions into live core vs test residue without mutation;
2. map duplicate generations around signal/executor/managed-wake/mailbox paths;
3. identify replaceable shells while preserving rollback lineage.

KIRA COUNTER lane:
1. independently attack `execution_v0` for false-preserve risk and hidden dependencies;
2. check whether any disabled/archive candidate is still referenced by live code, schedule, RPC, or route;
3. identify any additional unclassified schema/functions/assets.

No deletion or runtime mutation is authorized at this checkpoint.
