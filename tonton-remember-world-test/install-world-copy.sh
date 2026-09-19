#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== KIYUSAMA REMEMBER WORLD COPY — ONE SHOT ==="
echo "branch: $(git branch --show-current 2>/dev/null || echo UNKNOWN)"

if [[ "$(git branch --show-current 2>/dev/null || true)" != "tonton-remember-world-test" ]]; then
  echo "STOP: run only on isolated branch tonton-remember-world-test" >&2
  exit 2
fi

bash tonton-remember-world-test/bootstrap.sh

echo
echo "=== VERIFY COMPLETE COPY ==="
for cmd in claude codex mcp-memory; do
  command -v "$cmd" >/dev/null || { echo "MISSING: $cmd" >&2; exit 3; }
done
for f in "$HOME/.mcp.json" "$HOME/.codex/config.toml" "$HOME/.claude/rules/mcp-memory.md" "$HOME/.codex/AGENTS.md"; do
  test -f "$f" || { echo "MISSING: $f" >&2; exit 4; }
done
test -d "$HOME/.mcp-memory/memories" || { echo "MISSING: ~/.mcp-memory/memories" >&2; exit 5; }

cat > tonton-remember-world-test/RUN_STATE.txt <<EOF
WORLD_COPY=INSTALLED
BRANCH=tonton-remember-world-test
CLAUDE=$(command -v claude)
CODEX=$(command -v codex)
MCP_MEMORY=$(command -v mcp-memory)
MEMORY_DIR=$HOME/.mcp-memory/memories
NEXT=AUTH_THEN_FINAL_BLUE_UMBRELLA
EOF

echo
echo "=== WORLD COPY INSTALLED ==="
echo "No HOME/main write performed."
echo "Only remaining boundary: provider authentication, then final blue-umbrella proof."
echo "Claude phase: tonton-remember-world-test/CLAUDE_WRITE.md"
echo "Codex NEW SESSION phase: tonton-remember-world-test/CODEX_READ.md"
