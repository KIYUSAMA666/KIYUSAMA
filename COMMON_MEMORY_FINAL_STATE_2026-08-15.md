# KIYUSAMA OS — COMMON MEMORY FINAL STATE

Date: 2026-08-15
Status: CONTROL PLANE WRITE PATH VERIFIED / HTTP WRITE PERMANENTLY LOCKED
Decision owner: KIYUSAMA

## Final Architecture

Official WRITE path:

SORA decision
-> user-authorized Supabase control plane
-> common_memory.control_plane_dispatch_write(...)
-> one-time full-payload capability generated inside DB
-> common_memory.executor_write_memory_capability(...)
-> common_memory.knowledge_entries
-> append-only audit_log

The capability token is generated, consumed, and discarded inside the database. It is not returned to SORA.

The public/HTTP Gateway is NOT the production WRITE path.

## Edge Function Final State

Function: common-memory-test
Version: 20
Status: ACTIVE
verify_jwt: true

HTTP behavior:
- read: enabled
- write: always HTTP 403 with CONTROL_PLANE_ONLY
- executor_test: removed
- capability_write_test: removed
- any other action: rejected

Production HTTP WRITE is intentionally not opened.

## Final Runtime Privilege Boundary

common_memory_gateway_login on knowledge_entries:
- SELECT: true
- INSERT: false
- UPDATE: false
- DELETE: false

common_memory_control_plane:
- NOLOGIN
- no direct table privileges
- can execute control_plane_dispatch_write(...)

Gateway login cannot execute control_plane_dispatch_write(...).

common_memory_executor:
- NOLOGIN
- no direct table privileges
- can execute only the approved capability WRITE boundary required for runtime dispatch.

KIRA auditor remains READ-only.

## Control Plane Dispatch Proof

Production-equivalent dispatch was executed through common_memory.control_plane_dispatch_write(...).

Observed:
- WRITE success
- status: DRAFT for normal LOG
- source / created_by: KIYUSAMA_OS_EXECUTOR
- independent database READ BACK matched
- audit result: SUCCESS
- auth: CAPABILITY_VERIFIED
- issued_by: KIYUSAMA_OS_CONTROL_PLANE
- token_exposed: false

CORE dispatch proof also succeeded previously and was forced to PENDING_APPROVAL.

CORE / DECISION / RULE cannot become ACTIVE without KIYUSAMA approval.

## Capability Security

Final capability properties:
- cryptographically random
- token hash stored only while capability exists
- action bound to WRITE_MEMORY
- subject bound
- full payload SHA-256 bound across type / subject_key / title / content / version / source_ref
- single use
- replay rejected
- tampering rejected
- real-time TTL enforced using clock_timestamp()

Verified attacks:
- replay -> ALREADY_USED
- content tamper -> NOT_FOUND_OR_PAYLOAD_MISMATCH
- type tamper -> NOT_FOUND_OR_PAYLOAD_MISMATCH
- 30-second capability after 31 real seconds -> EXPIRED

The PostgreSQL transaction-stable now() TTL bug discovered during testing was corrected to clock_timestamp() for issuance, expiry validation, and used_at recording.

## Capability Lifecycle Cleanup

control_plane_dispatch_write(...) now deletes the one-time capability row immediately after consumption.

Final verification:
- dispatch WRITE succeeded
- independent READ BACK succeeded
- capability_cleanup: deleted
- executor_capabilities count after dispatch: 0

Expired historical/test capability rows were removed.

## Legacy / Test Attack Surface Removed

Removed without CASCADE after dependency verification:
- capability_http_attack_self_test(text)
- executor_capability_self_test()
- executor_capability_write_self_test()
- executor_http_self_test()
- legacy long-lived-token executor_write_memory(...)
- verify_sora_write_token(text)
- gateway_execute_capability_write(...)
- legacy subject-only consume_executor_capability(text,text,text)
- legacy issue_executor_capability(text,text,text,integer)

The obsolete Vault secret sora_common_memory_write_token was deleted after confirming zero remaining function references.

Remaining production capability path uses only the full-payload-bound capability functions.

## Temporary Infrastructure State

- pg_net: removed
- temporary test knowledge rows: 0
- capability-http-test-20260815: HTTP 410 disabled stub
- capability-http-attack-test-20260815: HTTP 410 disabled stub
- executor-http-relay-test-20260815: disabled test endpoint

## Independent KIRA Audit

KIRA independently verified from DB state:
- normal WRITE evidence
- replay BLOCKED / ALREADY_USED
- content tamper BLOCKED
- type tamper BLOCKED
- CORE PENDING_APPROVAL
- TTL EXPIRED
- now() -> clock_timestamp() remediation in live function code
- gateway direct WRITE privileges absent
- Control Plane Dispatch records exist
- temporary knowledge rows cleaned

KIRA's remaining uncertainty was raw-log-wide proof that no token was ever emitted. No claim beyond verified evidence is made here.

## GitHub Record Verification

PR #2 was independently re-read on 2026-08-15:
- state: closed
- merged: true
- merged_at: 2026-08-15T12:21:11Z
- merge commit: dab3342f04ea2acc14ec85006ea160a4c342efef
- changed files: 1
- additions: 159

## Security Advisor

No COMMON MEMORY-specific Security Advisor findings at final check.

Unrelated existing INFO findings remain:
- public.kiyusama_os_state: RLS enabled, no policy
- public.sora_write_test: RLS enabled, no policy

## Final Decision

HTTP WRITE does not need to be released.

The safer production architecture is Control Plane-only WRITE.

READ may continue through the JWT-protected Edge Function and dedicated read-only gateway login.

WRITE occurs only through the user-authorized Supabase control plane and DB-internal dispatch/capability/executor chain.

Principles:

NO LONG-LIVED SORA SECRET.
NO CAPABILITY TOKEN EXPOSED TO SORA.
NO DIRECT GATEWAY TABLE WRITE.
NO DIRECT EXECUTOR TABLE WRITE.
NO HTTP PRODUCTION WRITE.
ONE DISPATCH, ONE INTERNAL CAPABILITY, ONE AUDITED WRITE.
CORE / DECISION / RULE REQUIRE KIYUSAMA APPROVAL BEFORE ACTIVE STATE.
