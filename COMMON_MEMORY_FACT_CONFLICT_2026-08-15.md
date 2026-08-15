# KIYUSAMA OS — FACT Conflict Enforcement

Date: 2026-08-15
Status: IMPLEMENTED / SORA ATTACK TEST PASS / KIRA INDEPENDENT AUDIT PENDING

## Purpose

Protect FACT records so contradictory facts are not silently activated or overwritten.

## Implemented DB Controls

1. `normalize_fact_content(text)`
   - CRLF/CR normalized to LF
   - trailing whitespace before line breaks removed
   - leading/trailing whitespace removed
   - no semantic/AI similarity judgment

2. `protect_active_fact()`
   - ACTIVE FACT is immutable
   - direct content/title/subject/type/version/source/source_ref/created_by/trust/conflict changes are rejected
   - only ACTIVE -> SUPERSEDED with fact body unchanged is allowed

3. `enforce_fact_conflict()`
   - FACT only
   - compares same `subject_key`, `type=FACT`, existing `status=ACTIVE`
   - different normalized content + ACTIVE request => forced DRAFT + `conflict_flag=true`
   - existing ACTIVE FACT is not modified
   - conflict is written to `audit_log`
   - audit stores hashes/metadata, not FACT body

4. Partial unique index
   - `ux_knowledge_entries_active_fact_subject`
   - UNIQUE(subject_key) WHERE type='FACT' AND status='ACTIVE'
   - guarantees maximum one ACTIVE FACT per subject even under concurrent writes

5. Runtime FACT behavior
   - normal FACT request through Control Plane now requests ACTIVE
   - if conflict exists, DB forces DRAFT
   - CORE/DECISION/RULE behavior remains PENDING_APPROVAL

## Race-condition hardening discovered during implementation

Real concurrent testing found two additional implementation issues and both were fixed before closure.

### Issue A — audit result CHECK mismatch
Initial implementation attempted non-schema values such as `RECORDED_AS_DRAFT` / `BLOCKED_FROM_ACTIVE` in `audit_log.result`.
Existing DB constraint only allows:
- SUCCESS
- BLOCKED
- FAILED
- STOPPED
- ROLLED_BACK

Fix:
- `audit_log.result` now uses existing allowed values only
- detailed decision is stored in evidence

### Issue B — subject_key/version UNIQUE can fire before ACTIVE-FACT unique index
Real concurrent requests using the same subject/version showed the losing request could hit `knowledge_entries_subject_key_version_key` before the partial ACTIVE FACT index.

Fix:
- FACT ACTIVE fallback handles both uniqueness constraints
- losing FACT is preserved as DRAFT
- if requested version is already occupied, next free version is assigned
- audit records `requested_version`, `stored_version`, triggering constraint, and existing ACTIVE FACT id/version

### Same-content duplicate handling
A second identical FACT cannot also be ACTIVE because only one ACTIVE FACT is allowed.
Final behavior:
- first FACT remains ACTIVE
- second same-content FACT is stored DRAFT
- `conflict_flag=false`
- not treated as factual contradiction

## Test Results

A. First FACT ACTIVE -> PASS
B. Same-content FACT -> DRAFT, conflict=false -> PASS
C. Different-content FACT -> DRAFT, conflict=true -> PASS
D. Direct ACTIVE FACT content UPDATE -> rejected -> PASS
E. Direct ACTIVE FACT title UPDATE -> rejected -> PASS
F. ACTIVE -> SUPERSEDED only -> PASS
G. Real concurrent same-subject ACTIVE writes -> max one ACTIVE -> PASS
H. Different type with same subject_key -> no FACT conflict -> PASS
I. Whitespace / CRLF-only differences -> conflict=false -> PASS
J. Actual content difference -> conflict=true -> PASS
K. FACT conflict audit entry exists -> PASS
L. FACT body not copied into audit evidence -> PASS
M. Existing CORE approval trigger regression check -> PASS; CORE remains PENDING_APPROVAL and direct ACTIVE without approval rejected
N. Concurrent ACTIVE max one -> PASS
O. Losing concurrent FACT preserved -> DRAFT + conflict=true -> PASS
P. Race audit -> `RACE_CONDITION_UNIQUENESS` with existing ACTIVE id/version -> PASS
Q. Race audit body leakage check -> no `race-alpha` / `race-beta` plaintext in evidence -> PASS
R. Winning ACTIVE FACT remains unchanged after loser conflict -> PASS

Additional UPDATE-path check:
- DRAFT FACT updated with changed content + ACTIVE request -> DB forced DRAFT + conflict=true -> PASS

## Real concurrency proof

Two separate HTTP transactions were fired concurrently through a temporary fixed-purpose test endpoint.

Observed final rows:
- winner: ACTIVE, version 1, conflict=false
- loser: DRAFT, version 2, conflict=true

Both HTTP calls returned 200 after final fix.
The loser was not discarded.

## Cleanup

- temporary race test knowledge rows: removed
- temporary `pg_net`: removed
- temporary DB race wrapper: removed
- race-test Edge Function: overwritten with HTTP 410 disabled handler and JWT verification enabled
- `executor_capabilities`: 0 rows
- duplicate ACTIVE FACT subjects: 0

Audit evidence was intentionally retained.

## Security Regression Check

Gateway `knowledge_entries` privileges remain:
- SELECT: true
- INSERT: false
- UPDATE: false
- DELETE: false

`common-memory-test` remains:
- Version 20
- ACTIVE
- JWT ON
- HTTP WRITE => 403 CONTROL_PLANE_ONLY

Security Advisor after DDL changes:
- no COMMON MEMORY-specific findings
- existing unrelated INFO findings remain on `public.kiyusama_os_state` and `public.sora_write_test`

## Current Judgment

SORA implementation/attack-test judgment: A

Next required step:
KIRA independent DB audit of live triggers, index, runtime function, audit evidence, concurrency result, cleanup, and regression state.
