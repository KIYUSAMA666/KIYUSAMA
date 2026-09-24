import unittest

from internal_team_capability_lane import (
    CodexKCodeEdit,
    CodexKDispatchError,
    InternalTeamCapabilityLane,
)
from kira_audit_lane import GateDecision


class Gate:
    def __init__(self, decision=None):
        self.calls = []
        self.decision = decision or GateDecision(
            False, 901, "ROUTE", "CODEX_K_PR_REQUIRED", "CODEX_K_PR_REQUIRED"
        )

    def evaluate(self, *args):
        self.calls.append(args)
        return self.decision


def task(**changes):
    values = dict(
        message_id="message-1",
        wake_claim="durable-wake-claim",
        task_id="task-1",
        branch="codex/task-1",
        change_summary="make the approved repository edit",
        human_approval="KIYUSAMA_APPROVED",
    )
    values.update(changes)
    return CodexKCodeEdit(**values)


class DispatchTests(unittest.TestCase):
    def lane(self, gate=None, wake="MANAGED_WAKE", result=None):
        calls = []

        def runner(payload):
            calls.append(payload)
            return result or {
                "task_id": "task-1",
                "run_id": "run-1",
                "branch": "codex/task-1",
                "result_id": "result-1",
            }

        return InternalTeamCapabilityLane(gate or Gate(), lambda *_: wake, runner), calls

    def test_verified_code_edit_routes_once_to_existing_codex_k_runner(self):
        gate = Gate()
        lane, calls = self.lane(gate)
        lineage = lane.dispatch_code_edit(task())
        self.assertEqual(
            gate.calls,
            [("message-1", "KIRA_MANAGED", "MANAGED_WAKE", "CODE_EDIT", "REPOSITORY")],
        )
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["route"], "CODEX_K_PR_REQUIRED")
        self.assertEqual(calls[0]["decision_id"], 901)
        self.assertEqual(
            (lineage.task_id, lineage.run_id, lineage.branch, lineage.result_id),
            ("task-1", "run-1", "codex/task-1", "result-1"),
        )

    def test_forged_wake_never_reaches_gate_or_runner(self):
        gate = Gate()
        lane, calls = self.lane(gate, wake="REVIEW_ONLY")
        with self.assertRaises(CodexKDispatchError):
            lane.dispatch_code_edit(task())
        self.assertEqual(gate.calls, [])
        self.assertEqual(calls, [])

    def test_route_mismatch_never_reaches_runner(self):
        gate = Gate(GateDecision(False, 902, "DENY", "HUMAN", "APPROVAL_REQUIRED"))
        lane, calls = self.lane(gate)
        with self.assertRaises(CodexKDispatchError):
            lane.dispatch_code_edit(task())
        self.assertEqual(calls, [])

    def test_secret_main_destructive_permission_and_approval_bypasses_fail_closed(self):
        cases = (
            {"contains_secret": True},
            {"branch": "main"},
            {"destructive": True},
            {"permission_change": True},
            {"write_mode": "DIRECT"},
            {"human_approval": "SOMEONE_ELSE_APPROVED"},
        )
        for changes in cases:
            with self.subTest(changes=changes):
                gate = Gate()
                lane, calls = self.lane(gate)
                with self.assertRaises(CodexKDispatchError):
                    lane.dispatch_code_edit(task(**changes))
                self.assertEqual(gate.calls, [])
                self.assertEqual(calls, [])

    def test_runner_lineage_must_bind_task_run_branch_and_result(self):
        lane, _ = self.lane(result={
            "task_id": "other-task",
            "run_id": "run-1",
            "branch": "codex/task-1",
            "result_id": "result-1",
        })
        with self.assertRaises(CodexKDispatchError):
            lane.dispatch_code_edit(task())


if __name__ == "__main__":
    unittest.main()
