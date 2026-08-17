from __future__ import annotations

import hashlib
import hmac
import json
import re
import threading

MESSAGE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


class WakeService:
    def __init__(self, config, store, control, claude, logger):
        self.config, self.store, self.control, self.claude, self.log = config, store, control, claude, logger

    def authenticate(self, body: bytes, sender: str | None, signature: str | None) -> bool:
        expected = "sha256=" + hmac.new(self.config.wake_hmac_secret, body, hashlib.sha256).hexdigest()
        return sender == self.config.wake_sender and signature is not None and hmac.compare_digest(signature, expected)

    def accept(self, body: bytes, sender: str | None, signature: str | None) -> tuple[int, dict]:
        if not self.authenticate(body, sender, signature):
            return 401, {"error": "unauthorized"}
        try:
            value = json.loads(body)
            if set(value) != {"message_id"} or not isinstance(value["message_id"], str) or not MESSAGE_ID.fullmatch(value["message_id"]):
                raise ValueError
        except (json.JSONDecodeError, ValueError, TypeError):
            return 400, {"error": "invalid event"}
        message_id = value["message_id"]
        claimed, _ = self.store.claim(message_id, self.config.lease_seconds)
        if not claimed:
            self.log.info("duplicate_wake", extra={"message_id": message_id})
            return 202, {"status": "duplicate"}
        thread = threading.Thread(target=self.execute_claim, args=(message_id,), daemon=True)
        thread.start()
        return 202, {"status": "accepted"}

    def execute_claim(self, message_id: str) -> None:
        row = self.store.get(message_id)
        session_id = row["session_id"] if row else None
        try:
            self.control.write_status(message_id, {"status": "running", "attempt": row["attempts"], "resumed": bool(session_id)})
            task = self.control.fetch_task(message_id)
            result = self.claude.run(task, session_id)
            self.store.save_session(message_id, result.session_id)
            self.control.write_status(message_id, {"status": "succeeded", "session_id": result.session_id, "result": result.result, "audit": {"max_turns": self.config.max_turns, "allowed_tools": self.config.allowed_tools, "disallowed_tools": self.config.disallowed_tools}})
            self.store.finish(message_id, "succeeded", result.result)
            self.log.info("run_succeeded", extra={"message_id": message_id, "status": "succeeded"})
        except Exception as exc:
            self.store.finish(message_id, "retryable", type(exc).__name__)
            try:
                self.control.write_status(message_id, {"status": "retryable", "error": type(exc).__name__})
            except Exception:
                pass
            self.log.error("run_failed", extra={"message_id": message_id, "status": "retryable"})

