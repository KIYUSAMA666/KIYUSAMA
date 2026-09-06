# TONTON 7-STAGE RUNTIME MAP — 2026-09-06

Status: VERIFIED MAPPING BASELINE / NO RUNTIME MUTATION

This document maps the canonical TONTON 7-stage design to existing verified runtime objects. It does not claim that every listed object is currently healthy end-to-end.

## WATCH

Purpose: detect a new event or condition.

Verified existing objects / evidence:
- `gmail-pubsub-adapter-v1` — external Gmail event adapter exists and is ACTIVE.
- `slack-kira-wake-receiver-v1` — Slack wake receiver exists and is ACTIVE.
- `CODEX_CROSS_MONITOR_SCAN` — recurring monitor event exists in `common_memory.audit_log`.
- `executor_dispatch_stalled_watchdog_v1` — watchdog routine exists.

Status: MULTIPLE LEGACY WATCH SOURCES EXIST.

## WAKE

Purpose: transition the target from waiting/idle into active processing.

Verified existing objects / evidence:
- `kira-managed-agent-wake-v1` — ACTIVE Edge Function.
- `kira-managed-wake-executor-v1` — ACTIVE Edge Function.
- `AI_EXECUTOR_WAKE_STARTED` — 243 audit events observed.
- `AI_SORA_EXECUTOR_WAKE_STARTED` — 71 audit events observed.
- `AI_KIRA_MANAGED_WAKE_SENT` — managed-agent wake evidence exists.
- `common_memory.kira_managed_agent_runtime_v1` — runtime state holder exists.

Status: IMPLEMENTED IN MULTIPLE LEGACY LANES.

## ROUTE

Purpose: choose destination / lane / worker path.

Verified existing objects / evidence:
- `common_memory.auto_route_dispatch_write`
- `common_memory.managed_wake_dual_route_v1`
- `AUTO_ROUTE_DECISION` — 18 audit events observed.
- `AUTO_ROUTE_DEFERRED`
- `AUTO_ROUTE_REJECTED`
- `MANAGED_WAKE_DUAL_ROUTE` — 27 audit events observed.
- Codex S / K lane history and cross-monitor lane evidence.

Status: IMPLEMENTED; 2.0 MUST NORMALIZE LEGACY ROUTE VARIANTS INTO ONE CONTRACT.

## DELIVER

Purpose: place the message/task into the selected destination.

Verified existing objects / evidence:
- `common_memory.enqueue_agent_message_v1`
- `common_memory.enqueue_agent_message_v2`
- `common_memory.kira_main_mailbox_deliver_v1`
- `common_memory.kira_main_mailbox_deliver_from_message_v1`
- `AI_MESSAGE_ENQUEUED` — 228 audit events observed.
- `AI_MESSAGE_ENQUEUED_V2` — 19 audit events observed.
- `TONTON_SORA_DIRECT_OUTBOX_DISPATCH` — explicit TONTON dispatch evidence exists.

Status: IMPLEMENTED IN MULTIPLE PATHS.

## ACK

Purpose: prove receipt/acceptance independently from later reply/completion.

Verified existing objects / evidence:
- `common_memory.agent_messages` contains ACK state / `ack_at` history.
- historical audit found one `ACKED` message row.
- ACK was partially implemented and intentionally stopped.
- normal legacy executor paths frequently use `REPLIED` as terminal success rather than a distinct ACK transition.

Status: PARTIAL / IMPLEMENTATION STOPPED.

2.0 rule:
- preserve compatibility with REPLIED terminal paths;
- add explicit receipt/acceptance semantics where required;
- do not falsely classify ACK as never implemented.

## VERIFY

Purpose: independently establish that the claimed outcome actually happened.

Verified existing objects / evidence:
- `common_memory.audit_log`
- `common_memory.phase_audit_packets`
- `common_memory.phase_audit_verdicts`
- `common_memory.message_route_integrity_v1`
- readback/hash verification audit events such as `AUDIT_PACKAGE_DB_HASH_VERIFIED`
- GitHub evidence lane / independent recount artifacts exist outside this map.

Status: STRONG LEGACY VERIFICATION INFRASTRUCTURE EXISTS, BUT 2.0 MUST REQUIRE EXPLICIT EVIDENCE LINEAGE PER LOOP.

## RECORD

Purpose: persist the outcome, evidence, causal transition, and next continuation point.

Verified existing objects / evidence:
- `common_memory.audit_log`
- `common_memory.agent_messages`
- `common_memory.circuit_record_success_v1`
- `common_memory.circuit_record_failure_v1`
- COMMON MEMORY knowledge/state structures
- context retrieval evidence through `CONTEXT_PACK_LOADED` / `CONTEXT_PACK_V2_LOADED`

Status: IMPLEMENTED, BUT CAUSAL CONTINUATION FIELDS MUST BE MADE CANONICAL IN 2.0.

---

# 2.0 NORMALIZATION TARGET

The problem is not absence of parts. The parts already exist across different generations and paths.

2.0 must create one normalized contract over them:

```text
WATCH
  -> WAKE
  -> ROUTE
  -> DELIVER
  -> ACK
  -> VERIFY
  -> RECORD
  -> next WATCH
```

Each stage must emit a durable stage record with:
- `flow_id`
- `event_id`
- `stage`
- `actor`
- `target`
- `previous_stage`
- `status`
- `evidence_ref`
- `created_at`
- `next_stage`
- `failure_reason` when applicable

The canonical 2.0 layer should wrap existing working components first. It should not replace working legacy internals without evidence that replacement is necessary.

# NEXT BUILD ACTION

Create the 2.0 TONTON contract adapter / state layer that can observe and normalize these existing paths without restarting or deleting them.
