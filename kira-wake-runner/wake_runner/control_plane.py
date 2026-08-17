from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request


class ControlPlane:
    def __init__(self, base_url: str, token: str, timeout: int):
        self.base_url, self.token, self.timeout = base_url, token, timeout

    def _request(self, method: str, path: str, body: dict | None = None, idempotency_key: str | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        req = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=self.timeout) as response:
            return json.loads(response.read())

    def fetch_task(self, message_id: str) -> str:
        safe_id = urllib.parse.quote(message_id, safe="")
        value = self._request("GET", f"/v1/messages/{safe_id}")
        if set(value) != {"task"} or not isinstance(value["task"], str) or not value["task"].strip():
            raise ValueError("control plane returned invalid task")
        return value["task"]

    def write_status(self, message_id: str, body: dict) -> None:
        safe_id = urllib.parse.quote(message_id, safe="")
        self._request("POST", f"/v1/messages/{safe_id}/runner-status", body, f"wake-runner:{message_id}:{body['status']}")

