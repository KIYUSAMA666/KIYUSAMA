#!/usr/bin/env bash
set -euo pipefail

echo "=== KIYUSAMA WORLD COPY INSTALL ==="
echo "This installs the selected WORLD configuration into the isolated Codespace only."
echo "main branch is not modified by this script."

bash tonton-remember-world-test/bootstrap.sh

echo
echo "=== INSTALLED COMPONENTS ==="
command -v claude
command -v codex
command -v mcp-memory
test -f "$HOME/.mcp.json"
test -f "$HOME/.codex/config.toml"
test -f "$HOME/.claude/rules/mcp-memory.md"
test -f "$HOME/.codex/AGENTS.md"
test -d "$HOME/.mcp-memory/memories"

echo
echo "=== WORLD COPY READY ==="
echo "Next boundary is provider authentication, then the final cross-runtime run."
