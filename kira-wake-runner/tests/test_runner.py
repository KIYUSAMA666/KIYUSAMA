from __future__ import annotations

import hashlib
import hmac
import json
import logging
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from wake_runner.claude import ClaudeResult, ClaudeRunner
from wake_runner.gatekeeper_mcp import gate
from wake_runner.service import WakeService
from wake_runner.store import Store


class ImmediateThread:
    def __init__(self, target, args, daemon): self.target, self.args = target, args
    def start(self): self.target(*self.args)


class FakeControl:
    def __init__(self): self.tasks = {}; self.statuses = []
    def fetch_task(self, message_id): return self.tasks[message_id]
    def write_status(self, message_id, body): self.statuses.append((message_id, body))


class FakeClaude:
    def __init__(self): self.calls = []
    def run(self, task, session_id):
        self.calls.append((task, session_id))
        return ClaudeResult(session_id or "new-session", "done")


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = SimpleNamespace(data_dir=Path(self.tmp.name), wake_hmac_secret=b"secret", wake_sender="sender", lease_seconds=10, max_turns=7, allowed_tools="Read", disallowed_tools="Bash")
        self.store, self.control, self.claude = Store(Path(self.tmp.name) / "db"), FakeControl(), FakeClaude()
        self.control.tasks["m1"] = "trusted task"
        self.service = WakeService(self.config, self.store, self.control, self.claude, logging.getLogger("test"))

    def tearDown(self): self.tmp.cleanup()

    def event(self, message_id="m1", valid=True):
        body = json.dumps({"message_id": message_id}).encode()
        sig = "sha256=" + hmac.new(b"secret", body, hashlib.sha256).hexdigest()
        with patch("wake_runner.service.threading.Thread", ImmediateThread):
            return self.service.accept(body, "sender", sig if valid else "sha256=bad")

    def test_valid_wake_fetches_trusted_task(self):
        self.assertEqual(self.event()[0], 202)
        self.assertEqual(self.claude.calls, [("trusted task", None)])
        self.assertEqual(self.store.get("m1")["state"], "succeeded")

    def test_duplicate_event_does_not_launch(self):
        self.event(); status, body = self.event()
        self.assertEqual((status, body["status"], len(self.claude.calls)), (202, "duplicate", 1))

    def test_invalid_signature_fails_closed(self):
        self.assertEqual(self.event(valid=False)[0], 401)
        self.assertFalse(self.claude.calls)

    def test_missing_session_starts_new_session(self):
        self.event()
        self.assertIsNone(self.claude.calls[0][1])
        self.assertEqual(self.store.get("m1")["session_id"], "new-session")

    def test_existing_session_is_resumed(self):
        self.store.claim("m1", 10, now=1); self.store.save_session("m1", "saved"); self.store.finish("m1", "retryable")
        self.event()
        self.assertEqual(self.claude.calls[0][1], "saved")

    def test_crash_then_retry_resumes_without_parallel_claim(self):
        claimed, _ = self.store.claim("m1", 10, now=100)
        self.assertTrue(claimed)
        self.store.save_session("m1", "checkpoint")
        self.assertFalse(self.store.claim("m1", 10, now=105)[0])
        claimed, session = self.store.claim("m1", 10, now=111)
        self.assertEqual((claimed, session), (True, "checkpoint"))

    def test_gatekeeper_absence_denies(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(gate({})["behavior"], "deny")

    def test_max_turns_and_permission_flags_are_bounded(self):
        cfg = SimpleNamespace(data_dir=Path(self.tmp.name), claude_bin="claude", max_turns=4, allowed_tools="Read", disallowed_tools="Bash", control_plane_token="token", gatekeeper_url=None)
        runner = ClaudeRunner(cfg)
        completed = SimpleNamespace(returncode=0, stdout=json.dumps({"session_id": "s", "result": "ok"}))
        with patch("wake_runner.claude.subprocess.run", return_value=completed) as run:
            runner.run("task", None)
        command = run.call_args.args[0]
        self.assertEqual(command[command.index("--max-turns") + 1], "4")
        self.assertIn("--permission-prompt-tool", command)
        self.assertNotIn("--dangerously-skip-permissions", command)
        self.assertEqual(command[command.index("--allowedTools") + 1], "Read")
        self.assertEqual(command[command.index("--disallowedTools") + 1], "Bash")


if __name__ == "__main__": unittest.main()
