# MULTI-AI ROOM v1 — RELEASE GATE v0.1

Status: DRAFT FOR INDEPENDENT AUDIT

Base main at creation: `b8f2734a23c38297e82dfac4a6d3eaab7cdb461e`

## Purpose

MULTI-AI ROOM v1 is not complete when every theoretically possible hole has been eliminated. v1 is complete when the defined v1 functions and attack conditions pass, the integrated room runs continuously without V1 BLOCKER-class accidents, and KIYUSAMA remains the final authority.

The Release Gate exists to prevent the completion boundary from moving every time a new hardening idea is discovered.

## Locked v1 boundary

The v1 completion path is:

1. COMMON MEMORY
2. ROLE / AUTHORITY
3. AI COMMUNICATION BUS
4. ROOM UI / shared operating room
5. restart / recovery and fault-injection integration
6. continuous multi-AI operation and final release evaluation

The final integrated system must support SORA / KIRA / 3号 / 5号 working through the same room while preserving external state, evidence-backed decisions, safe stop/recovery behavior, and KIYUSAMA final authority.

## Release Gate — four locked controls

### 1. EXIT CONTRACT

Each PHASE must define its exit conditions before closure. Once defined, implementation work may satisfy those conditions but may not silently add new exit conditions.

A PHASE may close only after:

- its predefined functional path passes;
- its predefined attack set passes;
- KIRA independent verification passes using actual code / actual CI or equivalent primary evidence;
- one Final Hunt is completed under the V1 BLOCKER RULE;
- the Final Hunt produces no unresolved V1 BLOCKER.

After those conditions are satisfied, the PHASE becomes `CLOSED` and work must move to the next PHASE.

### 2. V1 BLOCKER RULE

A newly discovered issue is a V1 BLOCKER only when all of the following are satisfied:

- `EVIDENCE = YES`: there is reproducible evidence, not only a theory or safety preference;
- `REACHABLE_NOW = YES`: the issue is reachable in the current v1 architecture, not only through a future feature that does not yet exist;
- and at least one of:
  - `BREAKS_V1 = YES`: it can actually break a v1 completion property; or
  - `BLOCKS_EXIT = YES`: it makes the current PHASE EXIT CONTRACT impossible to satisfy.

V1 completion properties include, where applicable:

- correct shared CURRENT / state behavior;
- safe restart and recovery;
- no duplicate or contradictory execution from the same authority/evidence;
- fail-closed behavior on invalid, ambiguous, stale, or forged state/evidence;
- no evidence-free PASS;
- no execution beyond KIYUSAMA final authority.

Classification:

- `V1 BLOCKER` — fix now.
- `V1.1` — v1 remains valid; hardening, defense-in-depth, operability, or quality improvement. Record and continue.
- `BACKLOG` — depends on a future/unintegrated function. Record and continue.

Discovery alone does not authorize a new implementation PR.

### 3. HUNT BUDGET

Each PHASE gets exactly one Final Hunt after its predefined attack set and KIRA independent verification pass.

During Final Hunt, any number of possible weaknesses may be identified, but only issues that satisfy the V1 BLOCKER RULE may interrupt closure.

V1.1 and BACKLOG findings are recorded without opening a repair branch in the current PHASE.

If Final Hunt finds no unresolved V1 BLOCKER, the PHASE closes and the next PHASE starts. A new speculative hunt is not permitted after closure.

### 4. REOPEN KEY

`CLOSED` is a state, not an opinion.

A CLOSED PHASE may be reopened only when:

- reproducible evidence demonstrates a current-v1 V1 BLOCKER; or
- later real integration exposes a V1 BLOCKER-class failure that could not exist or be reached before that integration;

and KIYUSAMA explicitly authorizes the reopen.

The following are not reopen keys:

- “it could be safer”;
- a new theoretical attack without current-v1 reachability;
- defense-in-depth only;
- a future-feature-only concern;
- a new idea discovered after the PHASE was properly closed.

## Release Gate lock

This Release Gate itself must not move during normal implementation.

Changing EXIT CONTRACT semantics, V1 BLOCKER classification, HUNT BUDGET, REOPEN KEY, or the v1 boundary requires an explicit KIYUSAMA decision to change the v1 plan. An implementation PR, SORA decision, KIRA finding, or 3号 Final Hunt may not silently rewrite this gate.

## COMMON MEMORY — current EXIT CONTRACT

COMMON MEMORY closes when all of the following are independently evidenced against the current main line:

### Functional path

- multiple memory candidates resolve to one executable CURRENT without search-order authority;
- durable/restart recovery returns the intended CURRENT when state/revision/lineage/storage freshness are valid;
- WRITE-BACK advances exactly one revision from the bound parent and preserves protected authority/control state;
- storage atomic commit binds CAS + result consumption + handoff consumption + CURRENT replacement as one commit boundary;
- recovered/read CURRENT after persistence obeys the same strict CurrentStateSnapshot contract used before persistence.

### Predefined attack set

- zero CURRENT -> HOLD;
- conflicting CURRENT state/revision/lineage/schema -> HOLD;
- malformed nested CURRENT -> HOLD;
- forged or invalid KIYUSAMA authority -> HOLD;
- stale or mismatched durable recovery expectation -> HOLD;
- duplicate result/handoff consumption -> HOLD;
- stale CAS / competing same-parent write -> at most one winner;
- malformed or injected WRITE-BACK provenance -> HOLD;
- unknown/noncanonical fields at final storage boundary -> HOLD before backend dispatch;
- backend failure cannot be reported as COMMITTED or create a partial visible commit;
- restart/recovery may not accept a CURRENT that normal READ or WRITE validation would reject.

### Closure sequence

`EXIT attack set PASS -> KIRA independent PASS -> 3号 Final Hunt x1 -> no unresolved V1 BLOCKER -> COMMON MEMORY CLOSED -> ROLE/AUTHORITY starts`

No additional COMMON MEMORY attack condition may be added to v1 merely because it is interesting. A new condition must first satisfy the V1 BLOCKER RULE.

## Final MULTI-AI ROOM v1 release condition

v1 may be released when:

- every PHASE EXIT CONTRACT is CLOSED;
- the predefined v1 attack set is PASS;
- SORA / KIRA / 3号 / 5号 operate through the integrated room for the defined continuous-operation run;
- V1 BLOCKER-class accidents during that run = 0;
- duplicate execution incidents = 0;
- evidence-free PASS incidents = 0;
- KIYUSAMA final-authority violations = 0.

Unknown theoretical weaknesses may still exist. Those become v1.1 or later work unless they satisfy the locked V1 BLOCKER RULE.
