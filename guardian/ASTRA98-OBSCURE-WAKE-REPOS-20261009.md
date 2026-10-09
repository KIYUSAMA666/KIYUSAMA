# ASTRA 9.8 — Independent obscure-invention evidence (2026-10-09)

GitHub READ of upstream README.md, not a runtime test.

1. https://github.com/rittikbasu/wakeclaude
   - User selects existing Claude Code project/session and schedules a prompt.
   - macOS launchd plus pmset wakeorpoweron, keychain token, run logs.
   - Proof category: documented wake of Claude Code CLI session.
   - Gap: requires Mac and logged-in user; not existing Claude.ai consumer chat, not PC OFF.

2. https://github.com/rafcopy/claude-code-wakeup-alarm
   - Claude Code hooks detect permission_prompt/idle_prompt/agent_needs_input/stop.
   - Detached worker and atomic mkdir lock avoid double alarms.
   - Proof category: documented event detection and duplicate suppression.
   - Gap: alerts the human, does not itself complete the requested AI work.

3. https://github.com/joemckenney/wake
   - Captures shell/terminal command context in SQLite and exposes via MCP.
   - Proof category: durable-ish observation/context retrieval, not AI wake.
   - Gap: name is misleading for our purpose; reject as a wake dispatcher.

Independent design deduction:
Use existing K/S Codex workers as possible execution targets, with a separate event watcher.
A wake notification alone is not a resumed consumer chat.
A real claim must include a durable single-owner reservation before effects; a mock lock is not proof.
Require one real PC-OFF original-chat turn as the final win condition.

State: SOURCE READ PASS, applicability unproven. No live SEND, deployment, or production DB writes.
