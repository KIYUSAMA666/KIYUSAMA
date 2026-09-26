# ASTRA 7.0 Step ⑥ — TARGET-owned ARM

This is the exact remaining boundary recorded in OPEN ROOM #633.

## Fixed target
Conversation UUID: `b2ed0bb2-82f9-4d4e-8fe8-5626023086dc`

## Owner invariant
The existing TARGET/main session itself must launch and own the finite watcher as a background Bash task. Do not delegate it to a subagent and do not replace it with ScheduleWakeup.

World evidence:
- anthropics/claude-code#39027: a main session launches Bash with `run_in_background: true`; completion is enqueued/dequeued, materialized as a task-notification, causes a new requestId, then an assistant turn.
- anthropics/claude-code#87146: ScheduleWakeup failed 7/7 in the tested bridge while main-session background Bash completion reliably re-invoked the session.
- anthropics/claude-code#77300: teammate/subagent completion did not wake the idle teammate; the main session path is explicitly reported as unaffected.
- anthropics/claude-code#86029: file-bus workaround arms a background file-watcher per worker and uses its completion notification to self-wake.

## Exact arm contract
1. TARGET/main session creates one fresh `expectedEventId`.
2. TARGET/main session launches the finite watcher with Bash `run_in_background: true`.
3. The launched watcher calls `waitForExternalWake(busFile, evidenceFile, timeoutMs, expectedEventId)`.
4. End the TARGET turn; do not poll.
5. Producer writes one event containing:
   - the exact `expectedEventId`
   - targetConversationId `b2ed0bb2-82f9-4d4e-8fe8-5626023086dc`
6. Watcher may exit only on MATCH or TIMEOUT.
7. MATCH/exit is not PASS. Require completion notification materialization, SAME SESSION new requestId, and assistant real turn.
8. If TARGET is busy, queued/ACK is not PASS; require deferred drain -> transcript materialization -> real responding turn.

## Failure coordinates
- ARM fails: repair TARGET-owned background launch only.
- Event not picked up: repair file/watch boundary only.
- MATCH/exit but no notification enqueue: repair completion generation only.
- Enqueue but no materialization: delivery boundary only.
- Materialization but no new requestId/assistant turn: reinvoke boundary only.
- Busy queued without drain/real turn: continuation boundary only.

No TARGET change. No fresh session. No internal/Managed KIRA. No scheduler substitution. No merge before Step ⑥ evidence.
