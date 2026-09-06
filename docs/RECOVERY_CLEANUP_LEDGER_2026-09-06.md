# KIYUSAMA OS 2.0 — RECOVERY / CLEANUP LEDGER

Date: 2026-09-06
Status: ACTIVE RECOVERY / KIRA AUDIT HOLD
Authority: KIYUSAMA

## Rule

Recovery and cleanup precede evolution.

```text
RECOVER -> CLASSIFY -> PRESERVE -> CLEAN -> REASSEMBLE -> VERIFY -> EVOLVE LATER
```

No runtime component is deleted, redeployed, restarted, invoked for proof, or promoted solely because it appears in this ledger.

## Classification

- `LIVE_CONTINUITY` — recent evidence shows the lane is still producing events.
- `PRESERVE_CORE` — valuable working/lineage asset; preserve before cleanup.
- `PRESERVE_CANDIDATE` — protect from cleanup while dependency/role is audited.
- `LEGACY_CANDIDATE` — older path; keep until replacement/lineage is proven.
- `EXPERIMENTAL_RESIDUE` — named test/probe/canary/diagnostic; cleanup candidate only after dependency proof.
- `FORENSIC_HOLD` — do not modify until identity/lineage is resolved.
- `EVOLUTION_PARKED` — future design idea, not part of recovery/build baseline.

## KIRA INDEPENDENT AUDIT 2026-09-06

Overall verdict: `HOLD`.

Accepted findings:
1. `codex-claude-runner-probe-v1` was internally double-classified. Corrected below to `PRESERVE_CANDIDATE`; it must not be a cleanup candidate until its Codex -> Claude lineage/dependencies are resolved.
2. Eleven ACTIVE Edge Functions were missing from the classification ledger. All eleven are now explicitly protected as `PRESERVE_CANDIDATE` pending evidence-based classification.
3. `slack-kira-wake-receiver-v1` is especially protected because it appears in the historical TONTON WATCH/runtime evidence map.
4. KIRA could verify TRASH DEMON deployment state was unchanged, but could not independently prove absence of invocation from deployment state alone. Therefore invocation status remains `UNVERIFIED_BY_INDEPENDENT_RUNTIME_LOG` rather than PASS.

No destructive action is authorized by this correction.

## 1. LIVE CONTINUITY

### CODEX monitoring lane
- `CODEX_CROSS_MONITOR_SCAN`
- SORA observation at ledger creation: 5,790 events, latest 2026-09-06 09:05 UTC.
- KIRA recount later observed 5,801, confirming continued growth.
- classification: `LIVE_CONTINUITY / PRESERVE_CORE`

### PROD004 audit scan
- `PROD004_AUDIT_CANDIDATE_SCAN`
- SORA observation at ledger creation: 5,277 events, latest 2026-09-06 09:05 UTC.
- KIRA recount later observed 5,288, confirming continued growth.
- classification: `LIVE_CONTINUITY / LEGACY_CANDIDATE`
- note: still active; do not call it dead residue.

## 2. RECENT END-TO-END MESSAGE / EXECUTION CONTINUITY

Verified historical 2026-09-03 SORA -> KIRA managed-wake trace:

```text
AI_SIGNAL_EMITTED
 -> MANAGED_WAKE_DUAL_ROUTE
 -> AI_MESSAGE_ENQUEUED
 -> AI_SIGNAL_RECEIVED
 -> AI_EXECUTOR_WAKE_STARTED
 -> CONTEXT_PACK_LOADED
 -> AI_EXECUTOR_REPLY_STORED
 -> KIRA_BC_TRACE_AUTH
```

Identifiers:
- parent message `259c01c3-8c82-47ee-affc-6aa2b1254735`
- thread `6e719b8f-7b97-430e-a618-1f7e9bf31d0a`
- execution `ac9a1f0e-aea5-4f14-9bcc-fe80c7299a17`
- KIRA agent `agent_015huKGzTmKTsT4jFD5YtSjZ`
- environment `env_011S65g7qUErttJ4hf45uYXd`
- session `sesn_013YTkHDtiatnRhj6CSy7mH6`
- function `kira-managed-wake-executor-v1`

KIRA independently confirmed the parent message exists as `REPLIED` with `ack_at = null`, consistent with ACK being partial/stopped and REPLIED serving as terminal compatibility in that path.

Classification: `PRESERVE_CORE`. This is historical continuity evidence, not proof of final TONTON.

## 3. PRESERVE CORE — CURRENTLY ACTIVE FUNCTIONS

Preserve first; evaluate during reassembly:
- `common-memory-test`
- `ai-signal-receiver-v1`
- `kira-signal-executor-v1`
- `sora-signal-executor-v1`
- `codex-openai-proxy-v1`
- `codex-task-bridge-v1`
- `codex-k-openai-proxy-v1`
- `kira-managed-wake-executor-v1`
- `kira-managed-agent-wake-v1`
- `kira-main-mailbox-mcp-v1`
- `gmail-pubsub-adapter-v1`
- `claude-lane-executor-v1`

`ACTIVE` means deployed/active; it does not by itself prove current E2E health.

## 4. PRESERVE CANDIDATES — AUDIT BEFORE CLEANUP

### Corrected double classification
- `codex-claude-runner-probe-v1`
  - reason: name says probe, but known lineage includes Codex/Claude cross-AI work. KIRA caught contradictory placement in both PRESERVE_CORE and EXPERIMENTAL_RESIDUE.
  - current classification: `PRESERVE_CANDIDATE` until dependencies and role are proven.

### Eleven ACTIVE functions omitted from ledger v1
- `kira-provider-presence-v1`
- `sora-provider-presence-v1`
- `kira-managed-agent-upgrade-v1`
- `kira-managed-custom-tool-upgrade-v1`
- `kira-managed-tool-inventory-probe-v1`
- `sensory-audio-listener-v1`
- `sensory-video-listener-v1`
- `sensory-multimodal-orchestrator-v1`
- `execution-github-dispatch-worker-v0`
- `execution-github-egress-gateway-v1`
- `slack-kira-wake-receiver-v1`

All are `PRESERVE_CANDIDATE` until dependency/role/last-use evidence is inspected. The sensory trio is not assumed to belong to any final sensory architecture merely from its name. `slack-kira-wake-receiver-v1` has stronger preservation priority because it is already referenced by historical TONTON runtime evidence.

## 5. FORENSIC HOLD — TRASH DEMON

- `tonton-trash-demon-v1` — ACTIVE, version 1.
- deployment/redeploy state: unchanged in KIRA's audit.
- independent proof of no invocation: `UNVERIFIED_BY_INDEPENDENT_RUNTIME_LOG`.
- do not invoke, redeploy, rename, delete, or use it as proof of the whole heart yet.
- original Demon Agent identity remains unresolved.

Classification: `FORENSIC_HOLD / PRESERVE_CORE`.

## 6. EXPERIMENTAL RESIDUE — CLEANUP CANDIDATES, NOT YET DELETEABLE

Names strongly indicating historical tests/probes/diagnostics/canaries include:
- `executor-http-relay-test-20260815`
- `capability-http-test-20260815`
- `capability-http-attack-test-20260815`
- `fact-race-test-20260815`
- `pg-net-anon-probe-20260815`
- `sora-openai-diagnostic-v1`
- `sora-openai-header-diagnostic-v1`
- `sora-openai-scope-diagnostic-v1`
- `sora-openai-billing-scope-diagnostic-v1`
- `phase-2d-b-idempotency-test`
- `phase-2d-c-recovery-test`
- `phase-2d-d-recovery-test`
- `phase-2d-e-circuit-test`
- `kira-managed-agent-probe-v1`
- `kira-managed-agent-bootstrap-v1`
- `kira-managed-agent-discover-v1`
- `kira-managed-session-contract-probe-v1`
- `kira-prod003-fresh-session-v1`
- `kira-deployment-run-probe-v1`
- `kira-wake-engine-03-followup-probe`
- `kira-wake-engine-03b-deployment-probe`
- `kira-wake-engine-03b-readback`
- `kira-wake-engine-03b-fix-v1`
- `kira-wake-engine-03b-fix-readback`
- `kira-wake-e2e-v1`
- `execution-canary-receiver-v0`
- `execution-canary-hmac-receiver-v0`
- `haribote-kira-wake-test-20260831`

Classification here is provisional from naming/known historical purpose. No deletion authorization is implied. Before cleanup, prove no live dependency and preserve source/hash/evidence/rollback lineage.

## 7. TONTON STATUS DURING RECOVERY

TONTON is **NOT COMPLETE** and final concept is **REOPENED**.

Legacy WATCH/WAKE/ROUTE/DELIVER/ACK/VERIFY/RECORD remains historical design/evidence vocabulary. OS 2.0 must not force recovered assets into it as final architecture.

Existing delivery, mailbox, signal, execution, and managed-agent paths are assets to preserve and reuse where useful.

## 8. EVOLUTION PARKED

Do not implement during recovery/cleanup/build baseline:
- JIMI-derived alternative TONTON concept until primary design is recovered/reconstructed and approved.
- future ambient/associative memory surface described by KIYUSAMA.
- further post-2.0 evolutionary redesigns.

## 9. NEXT CLEANUP ACTION

1. Audit dependencies/role/last-use evidence for all `PRESERVE_CANDIDATE` functions first.
2. For `EXPERIMENTAL_RESIDUE`, preserve slug/version/hash/source and prove no dependency before ARCHIVE/REMOVE-CANDIDATE classification.
3. For `PRESERVE_CORE`, map input/output/state/evidence, overlaps, and duplicate generations.
4. Independently inspect available invocation/runtime logs for `tonton-trash-demon-v1`; absence must not be inferred from unchanged deployment version.
5. No destructive removal until dependency map and KIYUSAMA approval are complete.
