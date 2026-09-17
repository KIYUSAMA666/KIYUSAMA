# Superpowers — isolated candidate

Status: CANDIDATE / SOURCE IDENTIFIED / NOT ADOPTED / NOT INSTALLED
Date: 2026-09-17
Upstream: https://github.com/obra/superpowers
Upstream pinned commit inspected: b36e0829c6d0140e93cfef2ca599b1b07d4a7797

## Why preserved

Superpowers is a multi-harness agent development methodology/plugin framework with skills for systematic debugging, verification before completion, TDD, planning, parallel/subagent work, code review, and related workflows. It is relevant to KIYUSAMA OS because its evidence-first debugging and verification discipline may complement existing guards without replacing KIYUSAMA authority or evidence systems.

## Important current upstream evidence

The inspected upstream commit is Release v6.3.0. Its commit record explicitly includes Codex integration/packaging work and a correction that Codex should use native skill discovery with no SessionStart hook. This is important: do not assume Claude Code and Codex use the same lifecycle integration.

## Isolation rules

- Do not merge to main without independent review and KIYUSAMA final GO.
- Do not install into production KIYUSAMA OS from this record.
- Do not grant new authority, credentials, network access, DB access, or execution authority.
- Preserve upstream license and attribution if source is later imported.
- Verify exact upstream files/license and runtime-specific behavior before reuse.
- Treat Claude Code / Codex / other harness integrations separately.

## Required evaluation

1. Pin upstream source/version and license.
2. Inventory skills and executable hooks/scripts.
3. Separate pure instruction skills from code/hook behavior.
4. Verify Claude Code behavior in isolation.
5. Verify Codex behavior in isolation using its native discovery path.
6. Check conflicts with KIYUSAMA OS evidence, authority, merge, and execution gates.
7. Classify each useful part as EXISTING / MODIFY / REQUIRED NEW or reject it.
8. Decide FULL REUSE / PORT / REIMPLEMENT only after evidence.

No adoption claim is made by this file.
