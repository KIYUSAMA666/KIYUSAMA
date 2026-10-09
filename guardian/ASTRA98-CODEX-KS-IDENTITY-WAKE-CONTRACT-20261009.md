# ASTRA 9.8 — FIRST UNPROVEN: identity-verified Codex K/S wake

Date: 2026-10-09. Independent research note; not a live wake claim.

## Source-backed mechanism
- Kensho recoverable managers: https://github.com/agent-team-project/kensho/blob/main/documentation/recoverable-managers.md
  Reports codex exec --json first thread.started/thread_id, persisted SessionID, codex exec resume <id> -, preflight local rollout, backoff and incarnation lock.
- Codex CLI source: https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs
  Resume and Fork are distinct commands.
- Codex upstream tests: https://github.com/openai/codex/blob/main/codex-rs/exec/tests/suite/resume.rs
  Checks resumed prompt appended to same rollout file.
- YoanWai agent-manager: https://github.com/YoanWai/agent-manager/blob/main/docs/usage.md
  Describes revival using stored conversation id and native resume command.

## Test contract, before live effects
1. Discover existing K/S worker metadata and persisted session IDs by read-only inspection. Never guess IDs.
2. Match each session ID to worker lane and local rollout record.
3. Require durable exclusive claim of operation_key, actor and incarnation before wake.
4. Invoke only an authorized worker resume endpoint; capture actual returned thread_id.
5. If actual id != expected id, label IDENTITY_MISMATCH/HOLD. No automatic adoption.
6. Record RESULT and ACK only after actual readback.
7. No external consumer-chat claim unless the original ChatGPT/Claude.ai conversation receives a verified same-body new turn.

## Important boundary
Codex CLI sessions are not the user's original ChatGPT SORA_03 or Claude.ai KIRA browser conversations. A cloud watcher cannot resume an unavailable local CLI session without a hosted runtime/session store. Do not use bypass-permissions or live SEND to fake a PASS.

Status: RESEARCH/CONTRACT. Worker session IDs and live wake are still UNPROVEN. Main untouched.
