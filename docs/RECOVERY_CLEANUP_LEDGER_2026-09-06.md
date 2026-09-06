# KIYUSAMA OS 2.0 — RECOVERY / CLEANUP LEDGER

Date: 2026-09-06
Status: ACTIVE RECOVERY / READ-ONLY RUNTIME AUDIT
Authority: KIYUSAMA

## Rule

Recovery and cleanup precede evolution.

```text
RECOVER -> CLASSIFY -> PRESERVE -> CLEAN -> REASSEMBLE -> VERIFY -> EVOLVE LATER
```

No runtime component is deleted, redeployed, restarted, or promoted solely because it appears in this ledger.

## Classification

- `LIVE_CONTINUITY` — recent evidence shows the lane is still producing events.
- `PRESERVE_CORE` — valuable working/lineage asset; preserve before cleanup.
- `LEGACY_CANDIDATE` — older path; keep until replacement/lineage is proven.
- `EXPERIMENTAL_RESIDUE` — named test/probe/canary/diagnostic; cleanup candidate only after dependency proof.
- `FORENSIC_HOLD` — do not modify until identity/lineage is resolved.
- `EVOLUTION_PARKED` — future design idea, not part of recovery/build baseline.

## 1. LIVE CONTINUITY

### CODEX monitoring lane
- `CODEX_CROSS_MONITOR_SCAN`
- observed count: 5,790
- latest observed: 2026-09-06 09:05:00 UTC
- classification: `LIVE_CONTINUITY / PRESERVE_CORE`

### PROD004 audit scan
- `PROD004_AUDIT_CANDIDATE_SCAN`
- observed count: 5,277
- latest observed: 2026-09-06 09:05:00 UTC
- classification: `LIVE_CONTINUITY / LEGACY_CANDIDATE`
- note: still active; do not call it dead residue.

## 2. RECENT END-TO-END MESSAGE / EXECUTION CONTINUITY

A verified 2026-09-03 trace exists for one SORA -> KIRA managed-wake flow:

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

Observed identifiers:
- parent message: `259c01c3-8c82-47ee-affc-6aa2b1254735`
- thread: `6e719b8f-7b97-430e-a618-1f7e9bf31d0a`
- execution: `ac9a1f0e-aea5-4f14-9bcc-fe80c7299a17`
- KIRA agent: `agent_015huKGzTmKTsT4jFD5YtSjZ`
- environment: `env_011S65g7qUErttJ4hf45uYXd`
- session: `sesn_013YTkHDtiatnRhj6CSy7mH6`
- executed function: `kira-managed-wake-executor-v1`

Classification: `PRESERVE_CORE` as a proven working historical continuity path. This is not a claim that it is the final TONTON concept.

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
- `codex-claude-runner-probe-v1`
- `claude-lane-executor-v1`

These are preserved because they are part of known message, execution, Codex, memory, or cross-AI lineage. `ACTIVE` means deployed/active in Supabase; it does not by itself prove current E2E health.

## 4. FORENSIC HOLD — TRASH DEMON

- `tonton-trash-demon-v1` — ACTIVE, version 1.
- Do not invoke, redeploy, rename, delete, or use it as proof of the whole heart yet.
- Original Demon Agent identity remains unresolved.

Classification: `FORENSIC_HOLD / PRESERVE_CORE`.

## 5. EXPERIMENTAL RESIDUE — CLEANUP CANDIDATES, NOT YET DELETEABLE

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
- `codex-claude-runner-probe-v1`
- `haribote-kira-wake-test-20260831`

Classification: `EXPERIMENTAL_RESIDUE` only by naming/known historical purpose. **No deletion authorization is implied.** Before cleanup, prove no live dependency and preserve source/hash/evidence.

## 6. TONTON STATUS DURING RECOVERY

TONTON is **NOT COMPLETE** and its final concept is **REOPENED**.

The legacy 7-stage model remains preserved as historical design/evidence vocabulary, but OS 2.0 must not force current recovery assets into that model as if it were the final architecture.

Existing delivery, mailbox, signal, execution, and managed-agent paths are assets to preserve and re-use where useful.

## 7. EVOLUTION PARKED

Do not implement during recovery/cleanup/build baseline:
- JIMI-derived alternative TONTON concept until primary design is recovered/reconstructed and approved.
- Ambient / associative memory surface: faint always-near memory cues that expand by association when touched.
- further post-2.0 evolutionary redesigns.

These belong after recovery, cleanup, and reassembly have produced a verified OS 2.0 baseline.

## 8. NEXT CLEANUP ACTION

For every `EXPERIMENTAL_RESIDUE` candidate:
1. preserve function slug/version/hash/source;
2. search current code/routines/schedules for dependencies;
3. inspect last invocation/evidence where available;
4. classify KEEP / ARCHIVE / REMOVE-CANDIDATE;
5. perform no destructive removal until the dependency map and human approval are complete.

For every `PRESERVE_CORE` component:
1. map input/output/state/evidence;
2. map overlaps and duplicate generations;
3. select the surviving 2.0 route by evidence;
4. keep rollback lineage.
