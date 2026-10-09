# ASTRA 9.8 — Managed resume vs original identity (2026-10-09)

Independent world evidence:
- https://github.com/agent-team-project/kensho/blob/main/documentation/recoverable-managers.md
  Codex daemon captures thread.started thread_id, resumes with codex exec resume <session-id> -, checks rollout files and workspace before resuming, falls back to fresh-spawn-plus-brief when absent.
- https://github.com/anthropics/claude-code/issues/86092
  Claude Code --resume <id> --bg reportedly forks to a new id without explicit --fork-session.
- https://github.com/anthropics/claude-code/issues/70170
  A background agent holding a session can block direct --resume.
- https://github.com/anthropics/claude-code/issues/84468
  Remote-control daemon restart can lose transcript resume context (issue includes local fix claim).

ASTRA 9.8 design consequence:
1. Codex K/S can potentially be managed worker sessions with persisted session identity.
2. Every resume needs readback of actual resulting thread/session ID; never equate exit=0 with same-person continuation.
3. If resume falls back to a new session, label NEW_WORKER, not ORIGINAL_CHAT.
4. This does not prove ChatGPT consumer SORA_03 or Claude.ai existing conversation wake.
5. A watcher must route events to eligible worker, obtain durable single-owner claim, and record result; HOLD unknown external effect.
6. No repeated retry without evidence. No main, production DB, or external SEND mutation.

Status: WORLD EVIDENCE FOUND / KIYUSAMA LIVE ORIGINAL CHAT WAKE UNPROVEN.
