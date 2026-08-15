# KIYUSAMA OS — COMMON MEMORY Gateway Verification

Date: 2026-08-15
Status: FUNCTIONAL PROOF A / SECURITY HARDENING IN PROGRESS
Decision owner: KIYUSAMA
Implemented and verified by: SORA

## Conclusion
COMMON MEMORY Gateway completed real HTTP READ and WRITE verification through the dedicated PostgreSQL LOGIN identity `common_memory_gateway_login`, followed by an independent database READ BACK.

The functional Gateway path is proven. The current deployed Edge Function is intentionally READ-only until caller-level WRITE authorization is completed.

## Verified Runtime Identity
- Login: common_memory_gateway_login
- Privilege role: common_memory_gateway
- SUPERUSER / CREATEDB / CREATEROLE / REPLICATION / BYPASSRLS: disabled
- Membership ADMIN OPTION: disabled
- Membership INHERIT OPTION: enabled
- Membership SET OPTION: disabled

Effective privileges:
- common_memory schema: USAGE only; CREATE denied
- knowledge_entries: SELECT / INSERT / UPDATE; DELETE denied
- approvals: SELECT only
- audit_log: SELECT / INSERT; UPDATE / DELETE denied

Isolation verified:
- anon: no COMMON MEMORY privileges
- authenticated: no COMMON MEMORY privileges
- public: no COMMON MEMORY privileges

## HTTP READ Proof
- HTTP 200
- subject_key: sora-common-memory-verify-2026-08-15
- count: 1
- Stored entry returned successfully through the dedicated LOGIN.

## HTTP WRITE Proof
Test subject_key: gateway-http-write-verify-2026-08-15
- HTTP 200
- inserted id: 4
- type: LOG
- status: DRAFT
- version: 1
- source / created_by: SORA
- Gateway immediate READ BACK matched.

## Independent READ BACK Proof
A separate direct SQL SELECT returned the same row (id 4, same subject_key/type/title/status/version/source/created_by).

WRITE RESPONSE IS NOT PROOF.
INDEPENDENT READ BACK COMPLETED.
Functional Gateway HTTP WRITE proof: A.

## Current Edge Function State
Function: common-memory-test
Current version at record time: Version 14
Status: ACTIVE
verify_jwt: enabled
READ: enabled
WRITE: locked with HTTP 403 (`WRITE_AUTHORIZATION_NOT_CONFIGURED`)

Reason: platform JWT verification validates a token, but caller-level WRITE authorization still needs a dedicated machine-auth design. Production WRITE remains locked until that layer is implemented.

## Database Connection Finding
Working route:
Edge Function -> Direct Postgres -> common_memory_gateway_login

Direct READ and WRITE both succeeded.

Unresolved optimization:
Shared Supavisor Transaction Pooler authentication with the custom LOGIN returned AUTH_FAILED even after password synchronization. This isolates the remaining issue from the database password, LOGIN existence, table permissions, and Gateway SQL logic. It is non-blocking for functional proof.

## Temporary Components Removed
- temporary password-sync RPC: removed
- pg_net extension used for internal HTTP verification: removed
- bootstrap/admin runtime logic: removed

## RLS Note
The three common_memory tables currently have RLS disabled. Direct privilege verification shows anon/authenticated/public have no schema or table privileges. Supabase custom schemas require explicit Data API exposure and grants before client access.

RLS should be added only together with dedicated-role policies so the working Gateway is not accidentally blocked.

## Security Advisor
No COMMON MEMORY-specific Security Advisor finding was returned. Existing unrelated INFO findings remain on public.kiyusama_os_state and public.sora_write_test (RLS enabled with no policy).

## Final Status
- SECURITY identity boundary: VERIFIED
- Dedicated LOGIN isolation: VERIFIED
- Gateway HTTP READ: A
- Gateway HTTP WRITE: A (functional proof)
- Independent READ BACK: A
- Error sanitization: VERIFIED
- JWT platform verification: ENABLED
- Caller-level WRITE authorization: PENDING
- Supavisor custom-role route: PENDING / NON-BLOCKING
- Production WRITE: LOCKED UNTIL AUTHORIZATION DESIGN COMPLETES

Core principle preserved:
AI MAY OPERATE MEMORY.
AI DOES NOT RECEIVE DATABASE-WIDE AUTHORITY.

---

## Capability Authorization Hardening Update — 2026-08-15

### Executor and Auditor Separation
- `common_memory_executor`: NOLOGIN, no table privileges, no dangerous role attributes.
- `common_memory_kira_auditor`: READ-only audit role.
- KIRA auditor verification: SELECT only on `knowledge_entries` and `audit_log`; INSERT/UPDATE/DELETE denied.
- Executor verification: direct SELECT/INSERT/UPDATE/DELETE on `knowledge_entries` and `audit_log` denied.
- Executor can execute only approved authorization boundary functions.

### Audit Immutability Boundary
SORA/Gateway audit permissions were verified so audit records can be inserted/read but cannot be updated or deleted through the runtime identity.

### DB-internal Secret Verification
A SORA COMMON MEMORY write token was generated and stored inside Supabase Vault without returning the plaintext token. `verify_sora_write_token(text)` verifies candidates inside the database and exposes only a boolean result.

Verification:
- invalid candidate -> false
- correct internal candidate -> true
- public / anon / authenticated EXECUTE -> denied
- dedicated authorized role only -> allowed

### Executor Write Boundary
A SECURITY DEFINER write boundary was implemented so Executor does not receive direct table write privileges.

Behavior verified:
- invalid auth -> BLOCKED and audit record
- normal type -> DRAFT
- CORE / DECISION / RULE -> forced PENDING_APPROVAL
- CORE cannot be automatically activated by Executor
- successful write -> audit SUCCESS
- secret plaintext is not stored in audit evidence

Independent READ BACK was performed after boundary writes. Test memory rows were removed after verification; audit evidence was retained.

### HTTP -> Executor Boundary Proof
HTTP transport through the Edge Function was verified separately from DB-internal execution.

Verified chain:
HTTP -> Edge Function -> dedicated gateway login -> executor boundary -> WRITE -> READ BACK -> cleanup -> audit

Observed proof:
- HTTP 200
- upstream 200
- DRAFT result
- readback_ok=true
- cleanup=deleted
- secret_logged=false

### One-time Capability Model
Long-lived SORA-held secrets were rejected as the production design. A short-lived one-time capability model was implemented instead.

Capability properties:
- cryptographically random token
- only token hash stored in DB
- single use
- bounded TTL
- action bound to WRITE_MEMORY
- subject bound
- full payload bound by SHA-256 over type / subject_key / title / content / version / source_ref
- replay rejected
- payload tampering rejected

Verification:
- first valid use -> success
- replay -> ALREADY_USED
- content tamper -> NOT_FOUND_OR_PAYLOAD_MISMATCH
- type tamper -> NOT_FOUND_OR_PAYLOAD_MISMATCH
- CORE -> PENDING_APPROVAL
- test records cleaned up

### TTL Security Bug Found and Fixed
During real expiry testing, the first expiry attempt unexpectedly succeeded.

Root cause:
PostgreSQL `now()` is transaction-stable. A test that issued a 30-second capability and then called `pg_sleep(31)` inside the same transaction still saw the transaction-start timestamp, so expiry did not advance.

Remediation:
- capability issuance `expires_at` changed from `now()` to `clock_timestamp()`
- expiry comparison changed from `now()` to `clock_timestamp()`
- `used_at` recording changed to `clock_timestamp()`

Re-test with real elapsed time:
- TTL: 30 seconds
- wait: 31 seconds
- result: EXECUTOR_CAPABILITY_FAILED / EXPIRED
- stored_rows=0
- secret_logged=false

TTL expiry proof: A.

### Replay Concurrency Proof
Two requests using the same capability were observed within approximately 0.318 seconds:
- first request -> SUCCESS
- second request -> BLOCKED / ALREADY_USED

This confirms the row-lock/single-use boundary prevents a second use after the first capability consumption.

### Direct Gateway Write Privileges Reduced
After capability routing was established, legacy direct table write privileges on `common_memory_gateway_login` were removed.

Current effective `knowledge_entries` privileges for gateway login:
- SELECT: true
- INSERT: false
- UPDATE: false
- DELETE: false

WRITE is therefore intended to pass only through the capability wrapper/boundary.

### Legacy Capability Path Closed
The older subject-only 3-argument capability consume path was identified as unnecessary after full-payload binding was implemented.

Its Executor EXECUTE privilege was revoked. The old capability issue path without payload hash is also not executable by runtime identities.

### Test Cleanup
Final verification:
- temporary capability/HTTP knowledge rows: 0
- `pg_net`: removed
- temporary HTTP test endpoints: overwritten with HTTP 410 disabled handlers and JWT verification enabled
- gateway direct INSERT/UPDATE/DELETE: false
- legacy subject-only consume EXECUTE for Executor: false

### Current Production State
Function: `common-memory-test`
Version: 19
Status: ACTIVE
verify_jwt: true

Current actions:
- `read`: enabled
- `write`: still HTTP 403 / LOCKED
- `capability_write_test`: test-only capability path present for verification

Production WRITE has NOT been opened yet.

### Updated Security Status
- Dedicated DB identity isolation: A
- HTTP READ proof: A
- Historical functional HTTP WRITE proof: A
- Executor boundary: A
- KIRA audit READ role: A
- Capability single-use: A
- Replay resistance: A
- Payload tamper resistance: A
- Type tamper resistance: A
- CORE approval gate: A
- Real TTL expiry: A after clock_timestamp fix
- Test cleanup: A
- Production WRITE release: PENDING FINAL TRIGGER / AUTHORIZATION DECISION

Principle preserved:

NO LONG-LIVED SORA SECRET.
NO DIRECT EXECUTOR TABLE WRITE.
NO DIRECT GATEWAY TABLE WRITE.
ONE REQUEST, ONE CAPABILITY, ONE AUDITED WRITE.
CORE / DECISION / RULE REQUIRE KIYUSAMA APPROVAL BEFORE ACTIVE STATE.
