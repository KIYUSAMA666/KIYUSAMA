"""Minimal stdio MCP permission adapter. Any uncertainty is a denial."""
from __future__ import annotations

import json
import os
import sys
import urllib.request


def reply(request_id, result):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": request_id, "result": result}) + "\n")
    sys.stdout.flush()


def gate(arguments: dict) -> dict:
    url = os.environ.get("RUNNER_GATEKEEPER_URL")
    token = os.environ.get("RUNNER_CONTROL_TOKEN")
    if not url or not token:
        return {"behavior": "deny", "message": "Gatekeeper is not configured"}
    try:
        body = json.dumps(arguments).encode()
        req = urllib.request.Request(url, data=body, method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as response:
            value = json.loads(response.read())
        if value.get("behavior") == "allow":
            return {"behavior": "allow", "updatedInput": value.get("updatedInput", arguments.get("input", {}))}
        return {"behavior": "deny", "message": str(value.get("message", "Gatekeeper denied"))}
    except Exception:
        return {"behavior": "deny", "message": "Gatekeeper unavailable"}


def main():
    for line in sys.stdin:
        try:
            request = json.loads(line)
            method, request_id = request.get("method"), request.get("id")
            if method == "initialize":
                reply(request_id, {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "kira-gatekeeper", "version": "1"}})
            elif method == "tools/list":
                reply(request_id, {"tools": [{"name": "approve", "description": "Ask external Gatekeeper for a tool decision", "inputSchema": {"type": "object", "additionalProperties": True}}]})
            elif method == "tools/call" and request.get("params", {}).get("name") == "approve":
                decision = gate(request["params"].get("arguments", {}))
                reply(request_id, {"content": [{"type": "text", "text": json.dumps(decision)}]})
            elif request_id is not None:
                reply(request_id, {})
        except Exception:
            continue


if __name__ == "__main__":
    main()

