#!/usr/bin/env bash
set -euo pipefail

BIN="$HOME/.local/bin/mcp-memory"
MEMDIR="$HOME/.mcp-memory/memories"
RULE_MARKER="# mcp-memory-rule-v1"

case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "unsupported arch: $(uname -m)"; exit 1 ;;
esac
case "$(uname -s | tr '[:upper:]' '[:lower:]')" in
  linux) OS=linux ;;
  darwin) OS=darwin ;;
  *) echo "unsupported os"; exit 1 ;;
esac

mkdir -p "$HOME/.local/bin" "$MEMDIR" "$HOME/.claude/rules" "$HOME/.codex"

if [ ! -x "$BIN" ]; then
  curl -fsSL "https://mcps.coah80.com/mcp-memory/mcp-memory-${OS}-${ARCH}" -o "$BIN"
  chmod +x "$BIN"
fi

python3 - "$HOME/.mcp.json" "$BIN" <<'PY'
import json, os, sys, re
p, cmd = sys.argv[1], sys.argv[2]
data={}
if os.path.exists(p):
    text=open(p).read()
    clean=re.sub(r'//.*$', '', text, flags=re.MULTILINE)
    clean=re.sub(r',\s*([}\]])', r'\1', clean)
    try: data=json.loads(clean)
    except Exception: data={}
data.setdefault("mcpServers", {})["memory"]={"command":cmd,"args":["--mode","mcp"]}
with open(p,"w") as f:
    json.dump(data,f,indent=2); f.write("\n")
PY

cat > "$HOME/.claude/rules/mcp-memory.md" <<'EOF'
# mcp-memory-rule-v1
Use the mcp-memory MCP tools for ALL persistent memory instead of any built-in memory system.
Before responding, search mcp-memory for relevant memories.
Save with memory_create after memory_search to avoid duplicates.
At session start call session_identify with your model name.
EOF

CFG="$HOME/.codex/config.toml"
if ! grep -q '^\[mcp_servers\.mcp-memory\]' "$CFG" 2>/dev/null; then
  cat >> "$CFG" <<EOF

[mcp_servers.mcp-memory]
command = "$BIN"
args = ["--mode", "mcp"]
EOF
fi

if ! grep -qF "$RULE_MARKER" "$HOME/.codex/AGENTS.md" 2>/dev/null; then
cat >> "$HOME/.codex/AGENTS.md" <<'EOF'

# mcp-memory-rule-v1
Use the mcp-memory MCP tools for ALL persistent memory instead of any built-in memory system.
Before responding, search mcp-memory for relevant memories.
Save with memory_create after memory_search to avoid duplicates.
At session start call session_identify with your model name.
EOF
fi

echo "mcp-memory: $("$BIN" --help >/dev/null 2>&1 && echo READY || echo INSTALLED)"
echo "claude-config: $HOME/.mcp.json"
echo "codex-config: $HOME/.codex/config.toml"
echo "memory-dir: $MEMDIR"
echo "=== MCP MEMORY SETUP END ==="
