# Guardian initial BODY lock race runtime evidence

Actor: SORA_02 support, three-agent review.
Observed at: 2026-10-06 08:38 JST.
Source commit: c5b081cb6e824f0716c68853cbdb0014766dc67c.
Test blob: 1080f6f5436192427dacc6e620889bb3a1cefc35.
Implementation blob: 133f66a2db065941bb6ef2e37dfe77e697b2a47c.
Runtime: Node v24.19.0, Linux Codex workspace. Not Windows, not GitHub Actions.
Command: node --test guardian/durable-core.test.mjs
Exit code: 0. Tests: 6, pass: 6, fail: 0, skipped: 0.
Cross-process test: two processes racing for one BODY produce exactly one owner — PASS (49.912387ms).
Assertions executed: WON count = 1; BLOCKED count = 1; persisted owner in proc-A/proc-B.

## Scope
The initial acquisition race in the committed test now has runtime evidence. GitHub check-run remains unproven/unexecuted; Vercel deployment rate limiting is unrelated.
This does not close the entire BODY LOCK lifecycle, browser delivery, Windows runtime, crash/release/reacquire safety, or continuous execution.

## Independent review limits / next seam
The child catches all exceptions as BLOCKED. A partial JSON read can be misclassified as expected ownership rejection. There is no start barrier, child exit-code/stderr assertion, or persisted-owner-to-winning-child identity assertion.
Next work: strengthen that exact test distinction without browser SEND, then assess lock lifecycle separately. Do not repeat completed initial evidence acquisition or rerun unrelated workflows.

Browser SEND=0. KIRA Canary=0. Shared implementation changes=0.
