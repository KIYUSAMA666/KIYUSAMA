from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _secret(path_var: str) -> str:
    path = os.environ.get(path_var)
    if not path:
        raise ValueError(f"{path_var} is required")
    value = Path(path).read_text(encoding="utf-8").strip()
    if not value:
        raise ValueError(f"{path_var} is empty")
    return value


@dataclass(frozen=True)
class Config:
    data_dir: Path
    control_plane_url: str
    control_plane_token: str
    wake_hmac_secret: bytes
    wake_sender: str
    gatekeeper_url: str | None
    claude_bin: str = "claude"
    max_turns: int = 12
    allowed_tools: str = "Read,Glob,Grep"
    disallowed_tools: str = "Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch"
    lease_seconds: int = 900
    request_timeout: int = 30
    host: str = "127.0.0.1"
    port: int = 8080

    @classmethod
    def from_env(cls) -> "Config":
        turns = int(os.environ.get("CLAUDE_MAX_TURNS", "12"))
        if not 1 <= turns <= 100:
            raise ValueError("CLAUDE_MAX_TURNS must be between 1 and 100")
        return cls(
            data_dir=Path(os.environ.get("DATA_DIR", "/data")),
            control_plane_url=os.environ["CONTROL_PLANE_URL"].rstrip("/"),
            control_plane_token=_secret("CONTROL_PLANE_TOKEN_FILE"),
            wake_hmac_secret=_secret("WAKE_HMAC_SECRET_FILE").encode(),
            wake_sender=os.environ["WAKE_SENDER"],
            gatekeeper_url=os.environ.get("GATEKEEPER_URL") or None,
            claude_bin=os.environ.get("CLAUDE_BIN", "claude"),
            max_turns=turns,
            allowed_tools=os.environ.get("CLAUDE_ALLOWED_TOOLS", "Read,Glob,Grep"),
            disallowed_tools=os.environ.get("CLAUDE_DISALLOWED_TOOLS", "Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch"),
            lease_seconds=int(os.environ.get("CLAIM_LEASE_SECONDS", "900")),
            request_timeout=int(os.environ.get("HTTP_TIMEOUT_SECONDS", "30")),
            host=os.environ.get("LISTEN_HOST", "127.0.0.1"),
            port=int(os.environ.get("PORT", "8080")),
        )

