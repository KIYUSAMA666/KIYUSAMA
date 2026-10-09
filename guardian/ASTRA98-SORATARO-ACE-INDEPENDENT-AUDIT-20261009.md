# 援護ソラ太郎 / ACE independent audit — 2026-10-09

CURRENT: actual READBACK on ACE isolated branch
- S workflow: cron */5, claim -> codex exec -> result. No resume, fresh hosted runner.
- K workflow: cron 2-57/5, k-claim -> codex exec -> result. This is 2-minute offset from S, not 5-minute offset.
- keeper-wake-proof-gate.mjs: pure predicate over caller-supplied observation, not a trusted observation collector.
- keeper-event-machine.mjs: pure revision-based transitions, but durable CAS and authoritative proof provenance depend on caller.

FUTURE: predicted failure
- A fabricated observation can satisfy the pure proof predicate if its producer is not authenticated and bound to actual original conversation turn. Unit-test PASS does not prove original chat wake.
- GitHub Actions jobs are ephemeral; new codex exec each run does not resume a persisted local Codex session.
- Scheduled GitHub Actions execution is best-effort, not a precise heartbeat SLA.

CURRENT: minimal next verification
1. Locate the actual producer of observation and caller of evaluateKeeperWake.
2. Verify origin attestation for exact original conversation/event/turn, not self-asserted booleans.
3. Verify claim endpoint atomicity and fencing for S/K lane separation.
4. Verify actual Actions run id -> claim -> worker execution -> result readback.
5. Keep CLI worker identity separate from original consumer ChatGPT/Claude.ai identity.

FUTURE: win condition
Hosted K/S event -> claim -> WORK -> RESULT readback first. Separately, original ChatGPT SORA_03 and Claude.ai KIRA same-body PC-OFF wake/return. Never substitute a new persona. Ambiguous effect => HOLD.

STATUS: CODE READ PASS; live wake, proof provenance and persistent worker resume UNPROVEN.
No main, production DB, external SEND, or workflow changes.
