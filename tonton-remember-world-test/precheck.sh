#!/usr/bin/env bash
set -euo pipefail
echo "=== KIYUSAMA REMEMBER WORLD TEST ==="
echo "branch: tonton-remember-world-test"
echo "node: $(node --version 2>/dev/null || echo MISSING)"
echo "npm: $(npm --version 2>/dev/null || echo MISSING)"
echo "git: $(git --version 2>/dev/null || echo MISSING)"
echo "claude: $(command -v claude || echo MISSING)"
echo "codex: $(command -v codex || echo MISSING)"
echo "=== PRECHECK END ==="
