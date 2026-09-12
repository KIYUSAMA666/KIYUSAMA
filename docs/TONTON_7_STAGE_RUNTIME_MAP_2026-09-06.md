# TONTON LEGACY 7-STAGE RUNTIME MAP — 2026-09-06

Status: VERIFIED LEGACY MAPPING / TONTON 2.0 CONCEPT NOT LOCKED / NO RUNTIME MUTATION

This document maps the historical seven-stage TONTON design to existing verified runtime objects. It is a preservation/evidence map, not a declaration that the seven-stage model is the final TONTON 2.0 architecture.

Important correction:
- KIYUSAMA has explicitly stated that TONTON is still incomplete.
- Existing delivery/message paths are already capable of reaching destinations.
- A later JIMI/Gemini discussion challenged the assumption that TONTON must be modeled as a literal shoulder-tap/wake interaction.
- The exact JIMI proposal has not yet been recovered from primary evidence in this assembly pass.
- Therefore the seven stages below remain LEGACY_REFERENCE only until compared with the recovered JIMI alternative.

## WATCH

Purpose in the legacy model: detect a new event or condition.

Verified existing objects / evidence:
- `gmail-pubsub-adapter-v1` — external Gmail event adapter exists and is ACTIVE.
- `slack-kira-wake-receiver-v1` — Slack wake receiver exists and is ACTIVE.
- `CODEX_CROSS_MONITOR_SCAN` — recurring monitor event exists in `common_memory.audit_log`.
- `executor_dispatch_stalled_watchdog_v1` — watchdog routine exists.

Status: MULTIPLE LEGACY WATCH SOURCES EXIST.

## WAKE

Purpose in the legacy model: transition the target from waiting/idle into active processing.

Verified existing objects / evidence:
- `kira-managed-agent-wake-v1` — ACTIVE Edge Function.
- `kira-managed-wake-executor-v1` — ACTIVE Edge Function.
- `AI_EXECUTOR_WAKE_STARTED` — 243 audit events observed.
- `AI_SORA_EXECUTOR_WAKE_STARTED` — 71 audit events observed.
- `AI_KIRA_MANAGED_WAKE_SENT` — managed-agent wake evidence exists.
- `common_memory.kira_managed_agent_runtime_v1` — runtime state holder exists.

Critical distinction:
These objects prove that mechanisms named or behaving as wake exist in legacy lanes. They do NOT prove that the final TONTON concept requires a separate WAKE stage, nor that the desired KIYUSAMA experience of "TONTON" has been achieved.

Status: LEGACY WAKE MECHANISMS EXIST / FINAL TONTON WAKE SEMANTICS UNRESOLVED.

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

Status: IMPLEMENTED IN LEGACY PATHS.

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

Status: IMPLEMENTED IN MULTIPLE PATHS. DELIVERY ITSELF IS NOT THE MAIN MISSING PROBLEM.

## ACK

Purpose: prove receipt/acceptance independently from later reply/completion.

Verified existing objects / evidence:
- `common_memory.agent_messages` contains ACK state / `ack_at` history.
- historical audit found one `ACKED` message row.
- ACK was partially implemented and intentionally stopped.
- normal legacy executor paths frequently use `REPLIED` as terminal success rather than a distinct ACK transition.

Status: PARTIAL / IMPLEMENTATION STOPPED.

Do not falsely classify ACK as never implemented.

## VERIFY

Purpose: independently establish that the claimed outcome actually happened.

Verified existing objects / evidence:
- `common_memory.audit_log`
- `common_memory.phase_audit_packets`
- `common_memory.phase_audit_verdicts`
- `common_memory.message_route_integrity_v1`
- readback/hash verification audit events such as `AUDIT_PACKAGE_DB_HASH_VERIFIED`
- GitHub evidence lane / independent recount artifacts exist outside this map.

Status: STRONG LEGACY VERIFICATION INFRASTRUCTURE EXISTS.

## RECORD

Purpose: persist the outcome, evidence, causal transition, and next continuation point.

Verified existing objects / evidence:
- `common_memory.audit_log`
- `common_memory.agent_messages`
- `common_memory.circuit_record_success_v1`
- `common_memory.circuit_record_failure_v1`
- COMMON MEMORY knowledge/state structures
- context retrieval evidence through `CONTEXT_PACK_LOADED` / `CONTEXT_PACK_V2_LOADED`

Status: IMPLEMENTED, BUT CAUSAL CONTINUATION MUST REMAIN CANONICAL IN 2.0.

---

# DO NOT FORCE THE OLD DIAGRAM

The historical seven-stage flow was:

```text
WATCH -> WAKE -> ROUTE -> DELIVER -> ACK -> VERIFY -> RECORD
```

For KIYUSAMA OS 2.0 this is now a comparison candidate, not a locked architecture.

The alternative to recover is the JIMI/Gemini concept that may remove or redefine the need for a separate shoulder-tap WAKE stage by treating events as already present in a shared event/subscription fabric.

Until that exact proposal is recovered:

```text
TONTON_2_0_STATUS = NOT_COMPLETE
TONTON_CONCEPT_STATUS = REOPENED
LEGACY_7_STAGE = PRESERVED_REFERENCE
JIMI_ALTERNATIVE = RECOVERY_REQUIRED
```

# NEXT BUILD ACTION

Recover the original JIMI TONTON discussion from primary/persistent evidence, compare it against this legacy runtime map, then lock the smallest correct 2.0 contract. Reuse existing delivery/routing/runtime components; do not rebuild them merely because the concept is being reconsidered.
