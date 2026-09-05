# KIYUSAMA OS 2.0 / TONTON — MASTER HANDOFF BOOK

**Date:** 2026-09-05  
**Purpose:** KIRA context exhaustion / succession handoff / canonical recovery record  
**Status:** PHASE 1 Contract Code Freeze — implementation and CI evidence complete; KIRA FINAL PASS pending  
**Human Root Authority:** KIYUSAMA  
**Implementer / Orchestrator:** SORA  
**Independent Auditor:** KIRA  
**Memory / Record:** KUMO / external canonical memory

---

## 0. This book is for recovery, not storytelling

This document preserves what was actually designed, audited, implemented and verified so that a future SORA/KIRA/model does not restart from guesses or repeat failed routes. Historical PASS is historical evidence; it does not automatically make the current state PASS. Unknown means UNKNOWN, not broken and not absent.

Core principles:

- MODEL IS REPLACEABLE.
- STATE IS EXTERNAL.
- DATA COMPOUNDS.
- HUMAN DECIDES.
- EVIDENCE BEFORE MEMORY.
- CAPABILITY != AUTHORITY.
- ACKNOWLEDGED != VERIFIED.
- EXECUTOR CANNOT FINAL-VERIFY ITSELF.
- FREEZE != DELETE.
- OLD TONTON NEVER AUTO-PROMOTES TO OS2.

---

# PART I — WHY OS 2.0 WAS REBUILT

The previous KIYUSAMA OS accumulated working assets, temporary accounts, experiments and historical successes, but also repeated a dangerous pattern:

`TEMPORARY setup -> not formalized -> AI memory loss -> restart from wrong assumption -> reconfiguration/retry loop -> state degradation/confusion`

This was generalized as **FP-007 GENERAL FAILED PATTERN**.

A specific example was account mixing. The standard target account is **U-CHAN = yuantianchangxing2@gmail.com**. Historical temporary setup also used **yuantianc286@gmail.com**, and Apple/iCloud-related identities appear in some legacy systems. Account presence, project display names and actual ownership must never be conflated. No old account is deleted or logged out merely because another account is preferred.

The OS 2.0 rebuild therefore starts from evidence, containment, authority boundaries and cleanup rather than from reconnecting everything.

---

# PART II — BUILD006: AUTHORITY BEFORE IMPLEMENTATION

BUILD006 AUTHORITY MAP was audited and patched A-G, then CLOSED.

## PATCH-006-A — SELF-APPROVAL prohibited
Executor cannot issue its own final PASS.

## PATCH-006-B — KIRA INDEPENDENCE
SORA cannot overwrite KIRA's audit. SORA/KIRA disagreement becomes CONFLICT and goes to KIYUSAMA.

## PATCH-006-C — RISK GATE
R2+ requires Evidence -> Authority -> Blast Radius -> Rollback -> Approval.

## PATCH-006-D — FREEZE != DELETE
Classification is KEEP / FREEZE / QUARANTINE / DELETE-CANDIDATE. DELETE requires KIYUSAMA approval.

## PATCH-006-E — TONTON CONTAINMENT
CLEAN ROOM/RIVER failure cannot propagate directly into production. Promotion requires a separate gate.

## PATCH-006-F — EVIDENCE BEFORE MEMORY
Memory alone cannot establish CURRENT PASS.

## PATCH-006-G — CONFLICT AUTO-FREEZE
SORA/KIRA conflict freezes the affected target and direct downstream scope. If blast radius is unknown, freeze the related scope until known. READ/evidence/log/independent verification remain allowed; WRITE/DELETE/permission change/external send/production apply are blocked.

BUILD006.5 CLEANUP GATE was also CLOSED:

`DISCOVER -> IDENTIFY -> EVIDENCE -> CLASSIFY -> DEPENDENCY CHECK -> AUTHORITY CHECK -> FREEZE -> VERIFY -> KIYUSAMA APPROVAL -> CLEAN`

---

# PART III — BUILD007: INVENTORY, CLEANUP AND PLACEMENT

The rebuild proceeded while cleaning the estate rather than reconnecting blindly.

## Four READ-ONLY evidence lanes

- M / MEMORY — COMMON MEMORY, Notion, Supabase, canonical sources
- C / COMMUNICATION — Gmail, Slack, notifications
- E / EXECUTION — SORA, KIRA, Codex, Claude Code
- T / TONTON — WATCH -> WAKE -> ROUTE -> DELIVER -> ACK -> VERIFY -> RECORD

No surprise write/reconnect/retest is allowed during discovery.

## Account rule

Target standard: **yuantianchangxing2@gmail.com (U-CHAN)**.

Migration sequence:

`CURRENT ACCOUNT -> DEPENDENCY -> MIGRATION RISK -> U-CHAN MIGRATION -> READ-BACK VERIFY -> OLD ACCOUNT FREEZE -> APPROVAL -> CLEANUP`

ACCOUNT UNIFIED is not declared until LOGIN / OWNER / BILLING / OAuth / API PROJECT / DATA OWNER are aligned or an explicit exception is recorded.

## Important discovered states

### Zapier
Historical/current environment is mixed. PC-side history includes 286; iPhone and Gmail connections show U-CHAN. Two U-CHAN Gmail connections were observed and remain duplicate candidates until actual Zap references are known. No blind deletion.

### Supabase
One active healthy project exists. Display/name observed as `masa1234k@icloud.com's Project`, but that label is not proof of actual login/owner. Classification: KEEP / PROTECTED / ACCOUNT UNKNOWN / LEGACY FAILURE HISTORY / NO BLIND RETEST.

### Vercel
Legacy TONTON dependency exists and GitHub linkage was confirmed. Classification moved from ORPHAN CANDIDATE to KEEP / LEGACY-TONTON DEPENDENCY / ACCOUNT-MIGRATION CANDIDATE. No deletion/redeploy/account change during cleanup.

### Old TONTON
Historical assets and evidence exist. GitHub + Vercel dependency confirmed. Classification: KEEP + QUARANTINE/RIVER. Auto-promotion into OS2 is forbidden.

### Cloudflare
UNKNOWN/HOLD. Unknown is not evidence of absence.

---

# PART IV — OS 2.0 ASSET PLACEMENT

- KIYUSAMA — ROOT AUTHORITY / CEO
- SORA — ORCHESTRATOR / IMPLEMENTER
- KIRA — INDEPENDENT QA / STOP / AUDIT
- KUMO / Notion — MEMORY / RECORD
- Codex — EXECUTION (actual count/state still must be evidence-checked when needed)
- Claude Code — implementation support; current state must be rechecked when needed
- GitHub — source/version/evidence
- Supabase — protected data/memory candidate; HOLD for current TONTON implementation
- Gmail — communication
- Slack — communication/event
- Drive — evidence/docs
- Calendar — schedule
- Zapier — automation bridge; account cleanup pending
- Canva — visual output engine
- Suno — music engine / manual bridge
- Seedance — active test video engine R1
- Kling / Runway — video engine candidates
- TikTok / YouTube — distribution R2
- Spotify / Amazon Music for Artists — analytics/human bridge
- Vercel — legacy TONTON evidence host, no current production operation
- Old TONTON — RIVER / QUARANTINE
- Cloudflare — UNKNOWN/HOLD

Production conceptual flow:

`KIYUSAMA -> SORA -> KIRA GATE -> EXECUTION -> TONTON -> MEMORY / COMMUNICATION / CREATION / DISTRIBUTION`

Old TONTON path:

`OLD TONTON -> RIVER/QUARANTINE -> PROMOTION GATE -> OS2`

Never direct.

---

# PART V — OLD TONTON EVIDENCE AND WHAT MAY BE INHERITED

Historical GitHub/Vercel evidence showed useful components without granting them production trust.

PR #53 remained open/draft/unmerged historically. GitHub-native knock -> wake -> validate -> ACK had proof; TONTON_WAKE -> OS_RUNNER_REQUEST existed; replaceable runner seam and isolated Codex executor existed. Provider auth/model execution was not proven in that proof. Historical GitHub OIDC -> Supabase proxy remained UNTRUSTED/HOLD.

RIVER component map:

### Promotion candidates
- SIGNAL ENVELOPE
- WATCH/RECEIVE GitHub knock
- VALIDATE
- ACK
- OS RUNNER CONTRACT
- RUNNER SEAM / REPLACEABLE ADAPTER
- CODEX EXECUTOR CONTRACT (partial DELIVER)

### HOLD
- Gmail Fetcher
- Auth Boundary
- Codex supply portion

### QUARANTINE
- Supabase proxy
- historical production runner
- old Zapier dependency
- old production wiring

Inheritance means read code + correlate evidence + lineage + promotion gate. It does **not** mean rerun/deploy old systems "to see if they still work".

---

# PART VI — TONTON 7-FUNCTION CONTRACT DESIGN

TONTON is the nervous system, not the generator and not the database.

`WATCH -> WAKE -> ROUTE -> DELIVER -> ACK -> VERIFY -> RECORD`

## GAP-03 WATCH v0.2 LOCKED

WatchEvent fields:

`event_id / event_type / source / occurred_at / dedupe_key / payload_ref / tags / schema_version`

Unknown schema_version -> HOLD/REJECT + Evidence. WATCH may receive/normalize/validate/handoff; it may not infer authority/target, read raw payload body for decision, execute, or self-VERIFY.

## GAP-04 WAKE v0.2 LOCKED

WakeRequest:

`wake_id / wake_type / event_id / trace_id / source / dedupe_key / requested_capability / authority_ref(requested/unverified) / payload_ref / watch_evidence_ref / occurred_at / expires_at`

WAKE_ACCEPTED != READY. WAKE cannot authorize, infer target, execute processing or self-VERIFY.

## GAP-05 ROUTE v0.2 LOCKED

RouteRequest carries event/source/tags/capability/unverified authority/payload refs/timestamps.

RouteDecision:

`route_id / event_id / trace_id / selected_adapter_id / required_authority / risk_class / approval_required / decision / reason_code / expires_at`

`TARGET_SELECTED != AUTHORIZED`.

Only pre-registered adapters may be selected. Unknown -> HOLD. Risk classification and registries are centrally controlled. RouteDecision freshness is rechecked before BUS consumption.

Internal progression `ROUTE_RECEIVED -> CLASSIFIED -> TARGET_SELECTED -> AUTHORITY_REQUIRED` is intentionally deferred to ROUTE runtime implementation; it is not represented as RouteDecision's external final result code in PHASE 1.

## DELIVER — DELIVERY BUS / Minimum Contract LOCKED

Architecture:

`ROUTE -> DELIVERY BUS -> SORA/KIRA/JIMI/CODEX/FUTURE ADAPTERS -> TARGET -> ACK -> VERIFY -> EVIDENCE -> RECORD`

DeliveryEnvelope originally locked and later patched/aligned to include:

`event_id / source / target / payload_ref / authority / trace_id / dedupe_key / occurred_at / ttl`

The `ttl` field is required for replay protection.

AdapterResult includes `delivery_attempt_id`. This was not in the earliest minimum contract but became necessary through GAP-06 ACK correlation. KIRA flagged the spec drift; SORA formally adopted it as **D SPEC ALIGNMENT** rather than hiding implementation-first discovery.

BUS owns dedupe and authority. Adapter cannot bypass dedupe, elevate authority, change source, or self-VERIFY. Credentials/secrets never enter Evidence/log. Adapter identity is fixed by BUS/registry. Replay, timeout, retry and freeze behavior are bounded.

Delivery success path:

`ROUTED -> DEDUPE_CHECKED -> AUTHORIZED -> DELIVERY_ATTEMPTED -> ACKNOWLEDGED -> VERIFIED -> RECORDED`

Failure states:

`DUPLICATE / EXPIRED / SPOOF_DETECTED / AUTHORITY_DENIED / DELIVERY_FAILED / VERIFY_FAILED / TIMEOUT / FROZEN`

## GAP-06 ACK v0.2 LOCKED

AckReceipt:

`ack_id / event_id / trace_id / route_id / delivery_attempt_id / adapter_id / ack_status / ack_code / ack_ref / occurred_at / expires_at`

ACK must correlate event_id + trace_id + delivery_attempt_id. Each retry has a unique delivery_attempt_id. Late ACK after TIMEOUT/FROZEN is evidence only and cannot change state. Old-attempt ACK never becomes current. ACKNOWLEDGED != VERIFIED.

## GAP-07 VERIFY v0.2 LOCKED

VerifyRequest and VerifyResult separate execution from independent verification. Executor adapter cannot final-VERIFY itself. Expected outcome and verification policy must be fixed before delivery or latest AUTHORIZED and cannot be rewritten after execution to manufacture success.

VerificationStatus now includes:

`VERIFIED / VERIFY_FAILED / VERIFY_INCONCLUSIVE / VERIFY_TIMEOUT / VERIFY_EXPIRED / FROZEN`

VERIFY_INCONCLUSIVE escalates rather than silently retrying or becoming success.

## RECORD — Evidence Boundary v0.2 LOCKED

Evidence and Memory are separate.

EvidencePackage:

`evidence_id / event_id / trace_id / stage / actor / result / timestamp / authority_ref / approval_ref / source_evidence_ref / integrity_hash / sanitized=true`

Persistence PASS requires:

`STORE -> READ-BACK -> HASH COMPARE -> STORED_VERIFIED`

Memory Projection happens only after STORED_VERIFIED and references evidence_id. Memory may change; Evidence must not be rewritten by memory.

---

# PART VII — PHASE 1 IMPLEMENTATION STRATEGY

Implementation role split was fixed:

`SORA IMPLEMENTS -> KIRA INDEPENDENT AUDIT -> PATCH/HOLD/PASS -> KIYUSAMA FINAL`

KIRA does not write the implementation by default because that would blur executor/auditor independence.

PHASE 1 scope:

- Contract types/interfaces/enums
- minimal runtime validators/invariants
- registries
- contract tests

Explicitly excluded:

- BUS runtime logic
- external SDK/provider wiring
- secrets/auth
- Supabase/Gmail/Slack/OpenAI/Claude production connection
- deployment/promotion to production

Existing repository evidence established TypeScript/Node/ESM/NodeNext/ES2022/strict mode and node:test. Manual validators were chosen because the existing contract layer already used a manual runtime validation pattern and no Zod/Ajv dependency was established. Project runtime floor requirement: Node >=20.

---

# PART VIII — ACTUAL PHASE 1 IMPLEMENTATION AND AUDIT HISTORY

## Initial isolated implementation

Branch:

`sora/os2-contract-code-freeze-20260905`

Base branch:

`sora/tonton-fetcher-20260831`

Initial implementation commit:

`dee06ce23c1bc1b588d2e30c725c585a4b7cff77`

No main merge, production deployment, provider auth, Supabase connection or external-service wiring was performed.

SORA local test initially reported 6/6, but this was correctly treated as SORA-side evidence only, not KIRA PASS.

## KIRA first independent code audit — PATCH

KIRA refused to accept only SORA's test report and required actual code. After direct commit code was supplied, KIRA found:

A. DeliveryEnvelope missing `ttl`.
B. Delivery state machine guarded only ACKNOWLEDGED -> VERIFIED and otherwise returned true, allowing illegal jumps.
C. VerificationStatus missing VERIFY_TIMEOUT / VERIFY_EXPIRED / FROZEN.
D. AdapterResult `delivery_attempt_id` existed in implementation but not earliest locked spec; accepted as needed ACK alignment and required spec back-propagation.
E. ROUTE internal progress states were absent from RouteDecision; confirmed intentional runtime-scope deferral.

A/B/C were patched. B was changed to an allow-list/default-deny state machine.

## Independent CI after A/B/C

GitHub Actions was added for isolated contract verification. The post-patch CI established build/test evidence in an independent GitHub-hosted environment rather than reusing SORA local evidence.

## KIRA second audit — one remaining PATCH

KIRA read the patched code and discovered that `SPOOF_DETECTED` existed as a terminal DeliveryState but was unreachable from every nonterminal state because the new default-deny allow-list omitted it.

This was a real side effect of the safer state-machine rewrite.

Corrective rule:

`AUTHORIZED -> SPOOF_DETECTED` is allowed.

SPOOF_DETECTED remains unreachable from unrelated stages.

The patch was implemented and two regression tests were added:

1. AUTHORIZED can transition to SPOOF_DETECTED.
2. SPOOF_DETECTED is not reachable from unrelated stages.

---

# PART IX — CURRENT VERIFIED EVIDENCE AT HANDOFF

Current code HEAD at the time of the final CI evidence:

`08ce01632bd545e03f63907c88ae8c8a715ba6a8`

GitHub Actions run:

`33968827942`

Workflow:

`OS2 Contract Freeze`

Result:

`completed / success`

Environment observed in logs:

- Ubuntu 24.04.4 LTS
- Node v22.23.2
- npm 10.9.8
- TypeScript 5.8.3 installed for isolated contract build
- `npm run test:contracts`
- contract TypeScript build PASS

Final test totals on HEAD `08ce016...`:

- tests: 26
- pass: 26
- fail: 0
- cancelled: 0
- skipped: 0

Critical regression tests included and PASS:

- unknown WATCH schema rejected
- adapter self-authority elevation detected
- expired RouteDecision rejected
- ACKNOWLEDGED cannot become VERIFIED without independent evidence
- executor adapter cannot be its own verifier
- VERIFY_INCONCLUSIVE escalates
- DeliveryEnvelope declaration contains ttl
- full normal delivery path ROUTED -> ... -> RECORDED allowed
- ROUTED -> RECORDED illegal skip rejected
- terminal states cannot transition again
- AUTHORIZED -> SPOOF_DETECTED allowed
- SPOOF_DETECTED unreachable from unrelated stages
- VerificationStatus includes VERIFY_TIMEOUT
- VerificationStatus includes VERIFY_EXPIRED
- VerificationStatus includes FROZEN
- existing Universal Result tests also remained green

**Important:** CI SUCCESS is execution Evidence. KIRA still owns the independent FINAL audit decision. SORA must not convert CI success into KIRA PASS by itself.

---

# PART X — EXACT CURRENT STATE

At the moment this handoff book was written:

- BUILD006 AUTHORITY MAP A-G: CLOSED
- BUILD006.5 CLEANUP GATE: CLOSED
- BUILD007 inventory/cleanup placement: established; some account cleanup remains pending by design
- Old TONTON: KEEP + QUARANTINE/RIVER
- TONTON 7/7 Contract Design: LOCKED
- PHASE 1 Contract Code: IMPLEMENTED on isolated branch
- KIRA PATCH A/B/C: IMPLEMENTED
- D spec alignment: ADOPTED
- E ROUTE internal progression scope: CONFIRMED runtime-later
- SPOOF_DETECTED patch: IMPLEMENTED
- Latest tested code HEAD before this documentation commit: `08ce01632bd545e03f63907c88ae8c8a715ba6a8`
- GitHub Actions run `33968827942`: SUCCESS
- CI: 26/26 PASS
- KIRA FINAL PASS: **PENDING at the instant of this record**
- KIYUSAMA FINAL/Promotion decision: not implied by CI
- Main merge: NOT DONE
- Production deployment: NOT DONE
- Provider/auth wiring: NOT DONE

This documentation file itself is a later documentation-only commit and must not be confused with the tested code HEAD.

---

# PART XI — WHAT TO DO NEXT

## NEXT 1 — KIRA FINAL AUDIT

KIRA should verify the final SPOOF patch and the CI evidence tied specifically to `08ce016...` / run `33968827942`.

If no new inconsistency exists, KIRA may issue FINAL PASS for **PHASE 1 CONTRACT CODE FREEZE only**.

A PHASE 1 PASS must not be described as "TONTON complete" or "OS2 complete".

## NEXT 2 — KIYUSAMA FINAL DECISION

After KIRA PASS, KIYUSAMA is the final authority for whether PHASE 1 is accepted/closed and whether work proceeds. Do not merge or promote merely because KIRA passed.

## NEXT 3 — FREEZE THE CONTRACT BASELINE

After approval, record:

- approved commit SHA
- KIRA audit result
- CI run ID
- contract version
- Evidence lineage
- date/time
- known limitations/deferred items

No silent edits to a locked contract. Any later change is a new PATCH/version with new Evidence.

## NEXT 4 — LEGACY CODEX ADAPTER WRAPPER

Proceed to the previously selected implementation sequence:

`Contract Code Freeze -> Contract Tests -> Legacy Codex Adapter Wrapper -> one isolated E2E -> WATCH etc. runtime implementation`

The old Codex executor is not copied wholesale into production. It is wrapped behind the generic Delivery Bus adapter boundary so the model/engine remains replaceable.

Adapter wrapper must obey:

- BUS-owned dedupe
- BUS-owned authority
- fixed adapter identity
- no self-VERIFY
- no secret leakage to Evidence
- unique delivery_attempt_id
- ACK correlation
- timeout/freeze containment

## NEXT 5 — ONE ISOLATED E2E

Build exactly one contained path in CLEAN ROOM/RIVER first. Do not connect production Gmail/Supabase/Slack/OpenAI/Claude just to make the demo convenient.

The E2E must prove the state/evidence chain, not merely "something happened":

`WATCH -> WAKE -> ROUTE -> AUTHORITY GATE -> DELIVER -> ACK -> INDEPENDENT VERIFY -> EVIDENCE STORE/READ-BACK -> RECORD`

Every stage must leave traceable IDs and Evidence. Failure must stop/freeze correctly.

## NEXT 6 — IMPLEMENT WATCH/WAKE/ROUTE/ACK/VERIFY/RECORD RUNTIME IN BATCHES

Do not return to tiny one-change/one-message loops. Implement coherent batches, then KIRA independently audits the batch. R2+/irreversible/security/account changes stop for KIYUSAMA approval.

## NEXT 7 — ACCOUNT CLEANUP CONTINUES IN PARALLEL, READ-ONLY FIRST

Do not let TONTON implementation erase the cleanup mission.

Priority account work remains:

- Zapier 286/U-CHAN workspace and asset dependency inventory
- duplicate Gmail connection reference check
- Supabase actual ownership/login evidence
- Vercel account migration evidence if later needed
- Cloudflare discovery only when evidence path exists

No logout/delete/recreate/reconnect loops.

## NEXT 8 — ONLY THEN CONSIDER PROMOTION

Promotion Gate must ask:

- Is the component actually needed by OS2?
- Is its current code/evidence known?
- Is authority bounded?
- Is rollback possible?
- Is blast radius known?
- Has KIRA independently verified it?
- Does R2+ have KIYUSAMA approval?
- Can it be replaced without breaking the OS?

If any required answer is UNKNOWN, HOLD/FREEZE rather than guess.

---

# PART XII — DO NOT REPEAT THESE FAILURES

1. Do not restart from BUILD001 or old TONTON setup tests.
2. Do not equate historical PASS with current PASS.
3. Do not infer account ownership from a display name/email shown somewhere else.
4. Do not choose 286 or U-CHAN by guess and rebuild around it.
5. Do not create a new Supabase project to escape an ownership question.
6. Do not repeatedly Run/Retest Gmail/Zapier paths that already have historical evidence without a defined revalidation purpose.
7. Do not deploy old TONTON code merely to see whether it still works.
8. Do not let SORA self-approve its implementation.
9. Do not let KIRA both implement and independently certify the same change by default.
10. Do not call ACK success VERIFY success.
11. Do not call memory Evidence.
12. Do not delete an orphan candidate until dependency checks and KIYUSAMA approval are complete.
13. Do not connect production services during a Contract/isolated E2E phase for convenience.
14. Do not weaken default-deny state/authority behavior to make tests pass.

---

# PART XIII — SUCCESSION / WAKE-UP INSTRUCTION

When a future SORA/KIRA/model receives this book, begin with:

1. Read this document.
2. Read the cited/current GitHub commit and CI evidence rather than trusting summaries alone.
3. Confirm whether KIRA FINAL PASS was issued after this book was written.
4. Confirm whether KIYUSAMA approved PHASE 1 closure/promotion.
5. Resume from the first unresolved gate only.
6. Never recreate completed work from memory if the external evidence exists.

Recovery state at creation:

`BUILD006 CLOSED -> BUILD007 CLEANUP/PLACEMENT -> TONTON 7/7 CONTRACT LOCK -> PHASE 1 IMPLEMENTED -> KIRA PATCHES -> SPOOF PATCH -> GITHUB ACTIONS 26/26 SUCCESS -> KIRA FINAL PASS PENDING`

---

# FINAL PRINCIPLE

The point of TONTON is not merely to make two AIs send messages to each other. It is to create a durable, replaceable, evidence-driven nervous system for KIYUSAMA OS 2.0 in which models can change, engines can change, accounts can be cleaned, and failures can occur without losing authority, state, evidence or human control.

**MODEL IS REPLACEABLE. STATE IS EXTERNAL. EVIDENCE BEFORE MEMORY. HUMAN DECIDES.**
