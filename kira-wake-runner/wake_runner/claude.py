from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ClaudeResult:
    session_id: str
    result: str


class ClaudeRunner:
    def __init__(self, config):
        self.config = config
        self.home = config.data_dir / "claude-home"
        self.home.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.mcp_config = config.data_dir / "gatekeeper-mcp.json"
        adapter = str(Path(__file__).with_name("gatekeeper_mcp.py"))
        self.mcp_config.write_text(json.dumps({"mcpServers": {"gatekeeper": {"command": sys.executable, "args": [adapter]}}}), encoding="utf-8")
        self.mcp_config.chmod(0o600)

    def run(self, task: str, session_id: str | None) -> ClaudeResult:
        c = self.config
        cmd = [c.claude_bin, "-p"]
        if session_id:
            cmd += ["--resume", session_id]
        cmd += [task, "--output-format", "json", "--max-turns", str(c.max_turns),
                "--allowedTools", c.allowed_tools, "--disallowedTools", c.disallowed_tools,
                "--mcp-config", str(self.mcp_config), "--strict-mcp-config",
                "--permission-prompt-tool", "mcp__gatekeeper__approve"]
        env = os.environ.copy()
        env["HOME"] = str(self.home)
        env["CLAUDE_CONFIG_DIR"] = str(self.home / ".claude")
        env["RUNNER_CONTROL_TOKEN"] = c.control_plane_token
        env["RUNNER_GATEKEEPER_URL"] = c.gatekeeper_url or ""
        completed = subprocess.run(cmd, env=env, text=True, capture_output=True, check=False)
        if completed.returncode:
            raise RuntimeError(f"claude exited {completed.returncode}")
        try:
            value = json.loads(completed.stdout)
            returned_id = value["session_id"]
            result = value.get("result", "")
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            raise RuntimeError("claude returned invalid JSON") from exc
        if not isinstance(returned_id, str) or not returned_id:
            raise RuntimeError("claude returned invalid session_id")
        if session_id and returned_id != session_id:
            raise RuntimeError("resumed session_id changed")
        return ClaudeResult(returned_id, str(result))

