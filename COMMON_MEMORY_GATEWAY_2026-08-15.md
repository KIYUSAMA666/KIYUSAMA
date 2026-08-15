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
