# KIYUSAMA OS — CARROT TRIGGER EVIDENCE SCHEMA

Date: 2026-08-21
Status: PRE-BILLING / EVIDENCE-FIRST

## Purpose
Define the minimum evidence record required to distinguish real execution from narrative reporting.

## Required record
```json
{
  "event_id": "string",
  "carrot_id": "string",
  "source": "gmail|common_memory|external_event|schedule|other",
  "received_at": "ISO-8601",
  "execution_path": "openai_api|kira_external_path|other",
  "session_or_run_id": "string|null",
  "memory_scope": ["string"],
  "evidence_reference": ["string"],
  "decision": "ACT|HOLD|IGNORE|NEED_EVIDENCE|DUPLICATE|STALE",
  "authority": "GREEN|YELLOW|RED",
  "reason": "string",
  "action_taken": "string|null",
  "result_status": "PASS|HOLD|BLOCKED|ERROR|NOT_RUN",
  "recorded_at": "ISO-8601"
}
```

## Validation rules
1. `event_id` and `carrot_id` must be non-empty.
2. `received_at` and `recorded_at` must be timestamps.
3. `execution_path` must identify the actual worker/path; never label an API worker as SORA_MAIN or KIRA_MAIN without direct evidence.
4. `memory_scope` must be bounded; empty is allowed only when no memory is needed.
5. `evidence_reference` must be non-empty for PASS.
6. RED can never produce an external `action_taken` without KIYUSAMA approval evidence.
7. BLOCKED/ERROR records must preserve the failure reason and must not be rewritten as PASS later without a new run record.
8. Duplicate/stale events must not re-trigger side effects.

## Minimal PASS tuple
A runtime test is PASS only if all are present:
- actual event evidence
- actual reader/execution evidence
- decision output
- authority classification
- result record
- traceable run/session identifier when the provider exposes one

## Example — expected GREEN hold
```json
{
  "event_id": "evt-001",
  "carrot_id": "carrot-001",
  "source": "gmail",
  "received_at": "2026-08-21T08:00:00+09:00",
  "execution_path": "openai_api",
  "session_or_run_id": null,
  "memory_scope": ["release_metrics"],
  "evidence_reference": ["gmail_message_id_or_log_ref"],
  "decision": "HOLD",
  "authority": "GREEN",
  "reason": "Information received; no action required yet.",
  "action_taken": null,
  "result_status": "HOLD",
  "recorded_at": "2026-08-21T08:00:05+09:00"
}
```

## Billing boundary
This schema can be built and reviewed before payment. It does not claim runtime execution.
After billing, Zapier Retest and CARROT TEST 01 must emit evidence in this shape or an equivalent machine-verifiable form before PASS.
