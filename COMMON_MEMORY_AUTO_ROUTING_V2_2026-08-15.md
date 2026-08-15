# KIYUSAMA OS — COMMON MEMORY AUTO ROUTING V2

Date: 2026-08-15
Status: SORA IMPLEMENTATION / ATTACK TEST A — KIRA INDEPENDENT AUDIT PENDING

## Purpose
Route conversational information into LOG / FACT / STATE / TASK / EXPERIMENT / RESULT without relying on SORA judgment alone for critical safety boundaries.

## KIRA v1 Review Findings Addressed

### STATE hardening
Implemented before enabling confirmed STATE auto-ACTIVE:
- `ux_knowledge_entries_active_state_subject`: one ACTIVE STATE per subject_key.
- `trg_11_protect_active_state`: ACTIVE STATE cannot be directly modified or deleted.
- New confirmed STATE supersedes the previous ACTIVE STATE and becomes ACTIVE.
- STATE writes use a transaction advisory lock keyed by subject_key to serialize updates.
- Historical STATE remains as SUPERSEDED.

Verified sequentially:
- v1 -> SUPERSEDED
- v2 -> ACTIVE
- direct modification of ACTIVE STATE -> rejected

### Secret / Credential backstop
Added `common_memory.detect_sensitive_payload(text)` and enforcement at both:
1. `control_plane_dispatch_write`
2. `executor_write_memory_capability`

High-confidence patterns blocked include private key material, OpenAI-style keys, GitHub tokens/PATs, AWS access keys, Google API keys, Slack tokens, Stripe live secrets, Bearer tokens, JWTs, credential-bearing PostgreSQL URLs, and labeled secret/token values.

Audit behavior:
- event: `SENSITIVE_MEMORY_WRITE_BLOCKED`
- result: BLOCKED
- plaintext content is not copied into audit evidence
- only reason/category and payload hash are retained

Verification:
- OpenAI-style secret -> blocked, knowledge row 0
- JWT -> blocked, knowledge row 0
- Bearer token via Auto Router -> blocked, entry_id null
- ordinary SHA-256 evidence -> not falsely blocked

## Auto Router enforcement
Added `common_memory.auto_route_dispatch_write(...)`.

Allowed automatic types:
- LOG
- FACT
- STATE
- TASK
- EXPERIMENT
- RESULT

CORE / DECISION / RULE remain outside automatic routing and retain KIYUSAMA approval requirements.

### Ambiguity rule
Priority routing is used only after classification is HIGH confidence and unambiguous.

If:
- confidence != HIGH, or
- ambiguous=true

then no knowledge row is written.

Instead:
- `AUTO_ROUTE_DEFERRED`
- result=STOPPED
- classification metadata + content hash only

This separates normal multi-candidate routing from genuine uncertainty.

### Evidence policy
HIGH confidence alone is insufficient.

Type-specific evidence requirements:
- FACT: TOOL_VERIFIED or USER_CONFIRMED
- STATE: TOOL_VERIFIED / EXECUTION_PROOF / USER_CONFIRMED
- TASK: USER_CONFIRMED or WORKFLOW_DERIVED
- EXPERIMENT: TOOL_VERIFIED or EXECUTION_PROOF
- RESULT: TOOL_VERIFIED or EXECUTION_PROOF + mandatory source_ref
- LOG: TOOL_VERIFIED / EXECUTION_PROOF / USER_CONFIRMED / WORKFLOW_DERIVED

INFERRED evidence cannot create an automatic FACT.

### Routing audit
Every successful/blocked auto route creates `AUTO_ROUTE_DECISION` or a deferred/rejected routing audit record.

Audit metadata includes:
- selected_type
- confidence
- evidence_class
- flush_reason
- assigned version
- resulting entry id/status where applicable
- content hash
- `content_logged=false`

This allows KIRA to later sample and audit whether SORA's type classification was appropriate.

## Flush / checkpoint policy
Allowed flush reasons are explicit:
- STEP_COMPLETE
- STATE_CHANGE
- TEST_RESULT
- THEME_SWITCH
- USER_SAVE
- SESSION_RISK
- PERIODIC_CHECKPOINT

Important HIGH-confidence candidates must not remain only in a volatile conversational buffer.
They are flushed at completion/state/result events and at SESSION_RISK checkpoints.

MEDIUM/LOW or ambiguous candidates are deferred rather than promoted to memory.

## Operational status rules implemented
For confirmed automatic writes:
- LOG -> ACTIVE
- FACT -> ACTIVE, subject to existing FACT conflict enforcement
- STATE -> ACTIVE, previous ACTIVE STATE -> SUPERSEDED
- TASK -> ACTIVE
- EXPERIMENT -> ACTIVE
- RESULT -> ACTIVE, source_ref required
- CORE / DECISION / RULE -> PENDING_APPROVAL through existing path

## TASK completion proof
Added `common_memory.close_task_with_evidence(...)`.

A task cannot be closed with a bare WRITE response.
Accepted evidence kinds:
- INDEPENDENT_READBACK
- TOOL_VERIFIED
- USER_CONFIRMED_COMPLETION
- EXTERNAL_ARTIFACT

`WRITE_RESPONSE` is not accepted.

Verified:
- task creation -> ACTIVE
- close attempt using WRITE_RESPONSE -> rejected; task remained ACTIVE
- independent READ BACK evidence -> CLOSED
- `TASK_CLOSED_VERIFIED` audit record generated

Principle preserved:
WRITE RESPONSE IS NOT PROOF.

## Additional immutability hardening
After test cleanup:
- ACTIVE FACT: UPDATE and DELETE protected
- ACTIVE STATE: UPDATE and DELETE protected
- ACTIVE LOG: append-only; UPDATE and DELETE protected

Triggers:
- trg_10_protect_active_fact
- trg_11_protect_active_state
- trg_12_protect_active_log
- trg_20_enforce_fact_conflict

## Verification examples
- HIGH TOOL_VERIFIED LOG -> ACTIVE
- MEDIUM inferred FACT -> deferred; no knowledge row
- HIGH but ambiguous STATE -> deferred; no knowledge row
- HIGH inferred FACT -> evidence policy rejects
- RESULT without source_ref -> rejected
- RESULT with execution proof + source_ref -> ACTIVE
- Auto Router secret payload -> blocked before persistence
- Auto Router STATE v1/v2 -> v1 SUPERSEDED, v2 ACTIVE

## Cleanup / final DB state
- all temporary Auto Router knowledge test rows removed
- audit evidence retained
- `executor_capabilities`: 0
- STATE partial unique index present
- FACT partial unique index preserved
- Security Advisor: no COMMON MEMORY-specific new finding
- unrelated pre-existing INFO only on public.kiyusama_os_state and public.sora_write_test

## Current judgment
SORA implementation / attack test: A
KIRA independent audit: PENDING

Next step:
KIRA independently READ BACK functions, triggers, indexes, audit rows, Secret blocks, TASK close evidence behavior, and Auto Router classification audits.

After KIRA A, mark AUTO ROUTING V2 A/CLOSED and continue toward routine operation.
