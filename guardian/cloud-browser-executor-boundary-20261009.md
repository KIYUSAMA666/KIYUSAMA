# Cloud browser executor boundary — evidence and gates (2026-10-09)

## Goal
Resume the **same existing personal ChatGPT conversation** and existing Claude.ai conversation while the user's Windows PC is OFF. A new API conversation or a new ChatGPT thread is not equivalent.

## Observed evidence
- PC ON: existing Edge Browser Bridge performed a user-turn SEND and assistant reply READBACK; same ChatGPT conversation visible on iPhone (2026-10-09 07:40 JST).
- GitHub Actions: isolated PostgreSQL reservation contention, returned checkpoint -> JS proof mapper, and Guardian RETURN tests PASS (run 37868545798 / 37868545713).
- Vercel deployment dpl_32gy7xHJ2M6dHftbPVr4xpfsUqtv is READY with type LAMBDAS. This does not prove persistent browser process, persistent profile volume, or login state.
- Production Supabase has checkpoint save fenced function, but guardian_send_reserve_v1 was not found on read-only catalog inspection. No production reservation call performed.
- OpenLegion reference: src/browser/session_persistence.py stores per-agent browser state on a durable volume, default-off, restricted file permissions, and restores into a BrowserContext. This does not establish compatibility with ChatGPT or Claude accounts.

## FIRST UNPROVEN (do not mark PASS prematurely)
1. Authorized, supported cloud browser session established by ordinary account login; do not copy local PC cookies or tokens.
2. Browser profile survives cloud executor restart; session remains valid without bypassing anti-bot / MFA controls.
3. Exact pre-existing ChatGPT conversation ID is reachable in cloud browser, with identity and composer READBACK.
4. Exact pre-existing Claude conversation is reachable and verified separately.
5. Fenced durable reservation before any SEND, causal user-turn ID, one SEND maximum, assistant reply READBACK, ledger RESULT_COMMITTED.
6. Crash-after-reservation is UNCERTAIN and must not blindly replay SEND; no duplicate turn.
7. PC remains OFF, iPhone shows the same personal chat turn and reply; one complete cycle proven before any infinite-loop claim.

## Architecture constraint
A stateless Vercel Lambda is not a durable browser runtime. Do not assume local filesystem, long-running Playwright process, or logged-in context persists across invocations. Use an explicitly durable and authorized browser executor if required; keep Guardian transaction state in durable DB, never local process memory.

## Hard stops
No credential extraction, no anti-bot bypass, no public unauthenticated browser control, no new ChatGPT identity or proxy conversation, no main branch or production DB mutation without separate review. Preserve the user's existing PC Bridge evidence and existing canonical chat.

## Decision
Cloud executor session: UNPROVEN. Same-body PC-OFF SEND: UNPROVEN. No production SEND authorized by this document.
