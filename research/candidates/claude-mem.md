# claude-mem — isolated candidate record

Status: CANDIDATE / NOT ADOPTED / NOT INSTALLED
Date: 2026-09-17
Base main: `e41609aaa79aa6e48e93b42447ae66ae0354576a`

Purpose: preserve the upstream reference and evidence before any KIYUSAMA OS integration decision.

## Upstream

- Repository: https://github.com/thedotmack/claude-mem
- License: Apache-2.0 (upstream manifest/package metadata)
- Function: persistent coding-session memory/context compression and later context injection.
- Upstream Codex descriptor: `plugin/.codex-plugin/plugin.json`.
- The descriptor states compatibility with Claude Code and Codex-compatible sessions and points to `./hooks/codex-hooks.json`.

## Observed upstream architecture

Claude lifecycle documentation describes SessionStart, UserPromptSubmit, PostToolUse, Stop, and SessionEnd. SessionStart injects prior context; PostToolUse queues observations for compression; Stop requests session summarization. Production data is stored under `~/.claude-mem/`, including `claude-mem.db` (SQLite).

## Compatibility warnings from upstream evidence

Do not promote Codex compatibility from manifest presence alone. Upstream issue history documents Codex integration failures including marketplace/plugin-path setup problems, Windows/POSIX hook incompatibilities, and a case where Codex hooks reported success while capture was silently disabled when `.install-version` was missing. Reproduce or clear these in isolation before adoption.

## KIYUSAMA OS boundary

This candidate MUST NOT replace COMMON MEMORY by assumption.

Candidate responsibility under test:
- per-agent / per-coding-session experiential memory;
- capture -> compression -> persistence -> later retrieval/context injection.

Existing COMMON MEMORY responsibility remains separate until evidence proves otherwise:
- shared multi-AI CURRENT state;
- evidence/lineage;
- cross-agent shared state and authority-related records.

Potential conceptual pairing only (NOT YET PROVEN):
- Activation Plane / Waiter: cause the correct runtime/session to produce a new turn.
- claude-mem: restore relevant prior work context when a supported host session starts/resumes.

WAKE/NEW TURN and MEMORY RECALL are separate claims and require separate evidence.

## Required isolated verification before adoption

1. Pin an exact upstream version/commit.
2. Preserve upstream source and license without modifying production paths.
3. Verify Claude Code: capture -> persistence -> restart -> automatic context injection -> explicit historical search.
4. Verify Codex independently; do not infer it from Claude Code success.
5. Test Windows compatibility explicitly for the KIYUSAMA environment.
6. Record failures, duplicate/stale recall, wrong-project recall, and context contamination.
7. Compare with COMMON MEMORY for overlap/conflict; no replacement without evidence.
8. Only then classify FULL REUSE / PORT / REIMPLEMENT / REJECT.

## Current decision

SOURCE REFERENCE PRESERVED ONLY.
No installation, no production wiring, no database migration, no main-branch change, and no adoption decision in this record.
