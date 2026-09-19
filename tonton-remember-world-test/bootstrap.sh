#!/usr/bin/env bash
set -euo pipefail

echo "=== KIYUSAMA REMEMBER WORLD BOOTSTRAP ==="
echo "branch: $(git branch --show-current 2>/dev/null || echo UNKNOWN)"
echo "node-before: $(node --version 2>/dev/null || echo MISSING)"
echo "npm-before: $(npm --version 2>/dev/null || echo MISSING)"
echo "git: $(git --version 2>/dev/null || echo MISSING)"

if ! command -v claude >/dev/null 2>&1; then
  npm install -g @anthropic-ai/claude-code
fi

if ! command -v codex >/dev/null 2>&1; then
  curl -fsSL https://chatgpt.com/codex/install.sh | sh
fi

export PATH="$HOME/.local/bin:$HOME/bin:$PATH"

bash tonton-remember-world-test/setup-mcp-memory.sh

echo "claude: $(command -v claude || echo MISSING)"
echo "claude-version: $(claude --version 2>/dev/null || echo UNAVAILABLE)"
echo "codex: $(command -v codex || echo MISSING)"
echo "codex-version: $(codex --version 2>/dev/null || echo UNAVAILABLE)"
echo "mcp-memory: $(command -v mcp-memory || echo MISSING)"
echo "=== BOOTSTRAP END ==="
