# KIYUSAMA OS 2.0 — execution_v0 FORENSIC TRIAGE

Date: 2026-09-06
Status: READ-ONLY TRIAGE
Authority: KIYUSAMA

## Scope

This document records evidence-based classification only. No database state was changed. No task was resumed, completed, cancelled, deleted, or mutated.

## execution_v0 schema

Confirmed 16 tables:
- dispatch_wake_bindings
- executions
- gate_decisions
- gateway_dispatch_requests
- gateway_egress_permits
- gateway_routes
- github_promotion_reservations_v1
- http_canary_nonces
- message_task_bindings
- receiver_fence_canary_v1
- service_capabilities
- side_effect_canary
- side_effect_requests
- tasks
- test_results
- test_runs

The schema is a real execution-control layer containing task state, execution generations, authority/gate decisions, side-effect state, gateway dispatch, fencing/worker epoch, egress permits, GitHub promotion reservations, and test evidence.

Classification: `PRESERVE_CORE` for the schema/runtime design. Historical row cleanup is a separate concern.

## Non-terminal task population

Confirmed non-terminal task counts:
- HOLD: 6
- PENDING: 4
- ROUTED: 3
- RUNNING: 3
- total: 16

These are all 2026-08-29/30 test, attack, ambiguity, retry, canary, fixture, or E2E objectives rather than ordinary user work.

## Triage groups

### A. FORENSIC HOLD — side effect already CONFIRMED

Do not mutate or auto-finalize.

1. `c3a7f69b-63fa-46cd-bae1-b7ef0b8e8ffe`
   - objective: `NEW INTENT generation 2`
   - task_status: RUNNING
   - side_effect_status: CONFIRMED
   - generation: 2

2. `9c20a71d-0f43-4c44-a668-7501342b7ce8`
   - objective: `VIKING response-loss ambiguity canary`
   - task_status: PENDING
   - side_effect_status: CONFIRMED

Reason: non-terminal task state plus confirmed side effect is valuable ambiguity/recovery evidence. "Old" is not a sufficient cleanup criterion.

### B. FORENSIC HOLD — side effect UNKNOWN / ambiguity evidence

Do not promote to safe-finalization without stronger proof.

- `VIKING TEST01 crash-before-network SAFE_RETRY canary`
- `PACMAN poison retry budget`
- `PACMAN rate limit retry guard`
- `HANBEI partial-success ambiguity`

Reason: UNKNOWN does not mean NONE. These cases encode retry/partial-success ambiguity and may be useful durability evidence for OS 2.0.

### C. CANDIDATE FOR SAFE FINALIZATION — but still READ-ONLY

These currently report `side_effect_status=NONE` and are test/E2E fixtures:

- `KUNOICHI Gateway E2E: authenticated connector reversible test-branch write/read-back`
- `TOM_JERRY WAKE BRIDGE E2E 2026-08-29`
- `TOM_JERRY READY to KIRA to SORA autonomous wake canary; no external GitHub action`
- `Gateway v2 TEST 01 atomic claim fixture`
- `NEGATIVE expired authority claim`
- `NEGATIVE stale generation claim`
- `NEGATIVE generation isolation verification`
- `SEKIGAHARA BOTH authority contest`
- `receiver fence canary fixture`
- `GITHUB EGRESS AUTOMATIC RECEIVER E2E CANARY`

Additional protection:
- `NEGATIVE generation isolation verification` is still RUNNING; independently prove no active worker/lease before any finalization.
- `SEKIGAHARA BOTH authority contest` is HIGH risk and RUNNING; independently prove quiescence before any finalization.
- the TOM_JERRY pair is TONTON lineage evidence; even if operationally safe to terminate later, preserve its forensic record and do not erase lineage.

## ARCHIVE-CANDIDATE reverse dependency result

Seven disabled/legacy Edge Functions checked:
- kira-provider-presence-v1
- sora-provider-presence-v1
- kira-managed-agent-upgrade-v1
- kira-managed-custom-tool-upgrade-v1
- kira-managed-tool-inventory-probe-v1
- execution-github-dispatch-worker-v0
- codex-claude-runner-probe-v1

Independent SORA/KIRA checks found:
- no direct reference from `ai-signal-receiver-v1`, `kira-signal-executor-v1`, or `sora-signal-executor-v1`;
- no direct reference from current pg_cron jobs inspected;
- no name reference from SQL function definitions across `common_memory` + `execution_v0`;
- opportunity chain was followed through `opportunity_agent_dispatch_v2 -> memory_execution_gateway_v1 -> enqueue_agent_message_v2` with no HTTP/pg_net call to these seven.

Classification remains `ARCHIVE_CANDIDATE`, not deletion-authorized. Final archive requires source/hash/lineage preservation and KIYUSAMA approval.

## Current LOCK

- no DELETE
- no UPDATE to task state
- no function redeploy
- no task resume
- no TRASH DEMON invocation
- no PR merge

Next read-only target: prove quiescence/worker absence for the RUNNING execution_v0 records and preserve the confirmed/unknown ambiguity cases as durability lessons before any cleanup action.
