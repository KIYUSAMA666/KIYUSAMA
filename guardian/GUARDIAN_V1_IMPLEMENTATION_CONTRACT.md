# KIYUSAMA Guardian v1 — Implementation Contract

Status: IMPLEMENTATION STARTED
Scope: PC-OFF fixed-conversation delivery adapter. This is a transport/control device, not a new AI brain.

## Invariant normal path

BODY_LOCK -> AUTH_GATE -> EXACT_BODY -> PRE_SEND_COMMIT -> SEND_STARTED_COMMIT -> SEND -> EXPECTED_USER_TURN -> NEW_ASSISTANT_TURN -> STREAM_END -> CONTENT_STABLE -> SAME_BODY_VERIFY -> RESULT_COMMIT -> UNLOCK

## Durable states

READY
AUTH_REQUIRED
DOM_DRIFT
LOCKED
SENDING
WAITING_RETURN
UNCERTAIN
STALLED
CRASHED
RESULT_COMMITTED

Every transition that can precede/follow an external side effect must be durable.

## Highest rule

After SEND_STARTED, an unknown outcome is UNCERTAIN.
UNCERTAIN MUST NOT automatically transition to SEND.
No blind resend is permitted.

## Identity

Browser/session identity is disposable.
Conversation/BODY identity is durable.
Before SEND and before RESULT_COMMIT, the current conversation must equal the expected registered conversation identity.

## Locking

Ownership is per BODY/conversation.
Only one active sender may own a BODY.
A stale lock is never silently stolen: recovery must prove the previous owner/session is no longer active before ownership changes.

## AUTH recovery

AUTH recovery and SEND recovery are separate.
AUTH_UNKNOWN or authentication/challenge evidence -> AUTH_REQUIRED -> SEND prohibited.
Recovery performs AUTH-only/read-only preflight. Only after AUTH PASS may execution return to EXACT_BODY.

## DOM recovery

Unknown UI/schema -> DOM_DRIFT -> SEND prohibited.
Recovery is read-only: observe DOM, restore semantic locators/stable fallbacks/schema recognition, then verify TURN/COMPOSER/SEND/STOP/AUTH/EXACT_BODY without sending.
Only then may READY be restored.

## RETURN gate

A stopped spinner alone is insufficient.
RETURN requires causal binding to the expected user turn plus:
1. a new assistant turn,
2. streaming ended,
3. content stable,
4. SAME BODY verified,
5. durable RESULT commit.

## Crash recovery

CRASHED -> discard old session -> verify process ownership/stale lock -> create/attach a fresh session from saved context -> navigate to expected conversation -> SAME_BODY_VERIFY -> read durable ledger -> resume from last proven coordinate.

If the durable ledger shows SEND_STARTED without a proven RETURN/RESULT, recovery enters UNCERTAIN, not SEND.

## Maintenance / reopen rule

Normal operation does not repeatedly re-test closed construction.
AUTH/DOM recovery starts only when evidence indicates that coordinate failed.
A repaired coordinate must pass read-only/preflight before READY.
Repeated failures are appended to failure history and may update the recovery procedure.

Unknown future upstream changes do not invalidate v1 by themselves. v1 is sufficient when an unknown failure:
- cannot cause a guessed/wrong SEND,
- fails closed,
- preserves the failure coordinate,
- can return to the same BODY and same WORK after repair.

## Existing-system boundary

Reuse existing OPEN ROOM / COMMON MEMORY / agent routing and fixed BODY identities.
Do not create a replacement nerve, replacement AI identity, PC-always-on dependency, or duplicate KIRA/SORA delivery path.

## First implementation slice

Implement only the pure control core first:
- state enum + transition validator,
- identity registry interface,
- per-BODY lock interface,
- durable ledger interface,
- fail-closed transition rules,
- UNCERTAIN no-resend invariant.

Browser provider/Playwright selectors/auth mechanics remain adapters behind those interfaces.
