# ASTRA 9.8 — 無銘の変態・現在→未来→現在→未来 施工盤
Date: 2026-10-09 / Owner: support SORA / Scope: isolated research branch

## 現在①：KIYUSAMAの実物
- OPEN ROOM, Guardian, durable work/result ledger: existing parts. Do not rebuild.
- Codex K/S lanes exist by prior operator report, but their actual currently reachable runtime, persisted session IDs, and wake endpoints have NOT been independently read back in this investigation.
- Original SORA_03 ChatGPT consumer conversation and external KIRA Claude.ai consumer conversation have no proven PC-OFF same-body remote NEW TURN.
- Therefore the FIRST UNPROVEN is a real event -> existing Codex K/S wake -> exact worker identity readback, not another local decision function.

## 未来①：無銘の実装から借りる発明
| Source | Concrete mechanism | What to transplant | What NOT to infer |
|---|---|---|---|
| https://github.com/rittikbasu/wakeclaude | Scheduled Claude Code CLI session prompt, launchd and power wake | Persist session selector + wake schedule + execution log | Not a Claude.ai consumer-chat wake; macOS-only |
| https://github.com/rafcopy/claude-code-wakeup-alarm | Claude Code hook event -> detached process; atomic mkdir lock | Nonblocking event intake, duplicate-suppression pattern | Wakes human, not autonomous work |
| https://github.com/joemckenney/wake | Shell event capture -> SQLite -> MCP readback | Provenance and command/output readback pattern | Not a dispatcher or wake |
| https://github.com/agent-team-project/kensho/blob/main/documentation/recoverable-managers.md | Persisted Codex thread ID -> exec resume; fallback handling | Identity-bound worker resurrection | Not original ChatGPT browser conversation |

## 現在②：次の一発だけを選ぶ
READ-ONLY inventory of actual existing Codex K and S:
1. Find lane configuration and actual executable wake/resume adapter; read existing files only.
2. Identify source-of-truth session/thread IDs, runtime location, and whether PC OFF is possible. Redact credentials.
3. Confirm whether incoming OPEN ROOM event is wired to a worker entrypoint.
4. Produce a three-column verdict per lane: EVENT RECEIVED / WORKER RESUMED SAME ID / RESULT READBACK, each PASS/FAIL/UNPROVEN with concrete evidence.
5. If no adapter exists, classify exact missing boundary. Do not replace with a new identity or assert success from a queue message.

## 未来②：先回りして防ぐ障害
- Resumed a different session: compare actual returned thread ID to expected; IDENTITY_MISMATCH/HOLD.
- Two watchers race: durable operation_key unique reservation with fencing before any effect.
- Host powered off: prove hosted runtime; local tmux/launchd cannot work on an OFF PC.
- Permission/consent: stop at human approval gate; no permission bypass.
- Crash after external attempt: UNKNOWN_HOLD, no blind retries.
- Result exists only in database: label WORKER_RESULT_ONLY until original SORA/KIRA consumer conversation actually receives it.

## Exit criterion
Not another document, not a fake test PASS: one existing K/S worker responds to a genuine event with preserved identity and verified RESULT, then separate PC-OFF and original consumer-chat checks. Every result must have actual evidence.

STATUS: planning/readback only. No external SEND, no main changes, no production DB mutation.
