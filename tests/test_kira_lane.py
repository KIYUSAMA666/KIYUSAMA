import unittest
from uuid import uuid4

from kira_lane.managed import (
    CODEX_K_PR_REQUIRED, READ_ACTION, READ_SCOPE, READ_TARGET, READ_TOOL,
    GateUnavailable, InvalidRequest, KiraRequest, ManagedKiraLane,
    PermissionGateAdapter,
)


class Gate:
    def __init__(self, response): self.response, self.calls = response, []
    def permission_gate(self, *args): self.calls.append(args); return self.response


def response(decision="ALLOW", decision_id=9223372036854775807):
    return {"ok": True, "decision_id": decision_id, "decision": decision,
            "route": "LOCAL_READ", "reason": "verified policy"}


def request(**changes):
    values = dict(message_id=uuid4(), actor="KIRA", declared_scope=READ_SCOPE,
                  action_kind=READ_ACTION, target_class=READ_TARGET,
                  tool=READ_TOOL, arguments={"subject": "x"}, managed_wake="wake")
    values.update(changes)
    return KiraRequest(**values)


class LaneTests(unittest.TestCase):
    def lane(self, gate, reads):
        return ManagedKiraLane(gate, lambda args: reads.append(args) or ["row"],
                               lambda wake, message_id: wake == "wake")

    def test_exactly_one_tool_and_allow(self):
        gate, reads, req = Gate(response()), [], request()
        result = self.lane(gate, reads).execute(req)
        self.assertEqual(ManagedKiraLane.executable_tools(), (READ_TOOL,))
        self.assertEqual(gate.calls[0], (req.message_id, "KIRA", READ_SCOPE, READ_ACTION, READ_TARGET))
        self.assertEqual(result.status, "EXECUTED"); self.assertEqual(len(reads), 1)
        self.assertEqual(result.evidence.decision_id, 9223372036854775807)
        self.assertEqual((result.evidence.route, result.evidence.reason), ("LOCAL_READ", "verified policy"))

    def test_route_deny_and_human_never_execute(self):
        for decision, status in (("ROUTE", CODEX_K_PR_REQUIRED), ("DENY", "BLOCKED"), ("HUMAN", "BLOCKED")):
            reads = []
            result = self.lane(Gate(response(decision)), reads).execute(request())
            self.assertEqual(result.status, status); self.assertEqual(reads, [])

    def test_gate_failure_and_malformed_fail_closed(self):
        for raw in (None, {}, {**response(), "decision_id": "7"}, {**response(), "evidence": {}}):
            reads = []
            with self.assertRaises(GateUnavailable): self.lane(Gate(raw), reads).execute(request())
            self.assertEqual(reads, [])
        class Broken:
            def permission_gate(self, *args): raise OSError("down")
        with self.assertRaises(GateUnavailable): self.lane(Broken(), []).execute(request())

    def test_wrong_actor_mislabeled_critical_and_wake_are_rejected_before_gate(self):
        for req in (request(actor="SORA"), request(action_kind="DELETE"),
                    request(target_class="SECURITY_CONTROL"), request(managed_wake="bad")):
            gate = Gate(response())
            with self.assertRaises(InvalidRequest): self.lane(gate, []).execute(req)
            self.assertEqual(gate.calls, [])

    def test_duplicate_is_idempotent_and_conflicting_reuse_is_rejected(self):
        gate, reads, req = Gate(response()), [], request()
        lane = self.lane(gate, reads)
        first = lane.execute(req); second = lane.execute(req)
        self.assertIs(first, second); self.assertEqual((len(gate.calls), len(reads)), (1, 1))
        changed = request(message_id=req.message_id, arguments={"subject": "different"})
        with self.assertRaises(InvalidRequest): lane.execute(changed)


class AdapterTests(unittest.TestCase):
    def test_production_sql_signature_and_argument_order(self):
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def execute(self, sql, args): self.executed = (sql, args)
            def fetchone(self): return (response(),)
        class Connection:
            def __init__(self): self.value = Cursor()
            def cursor(self): return self.value
        connection, message_id = Connection(), uuid4()
        got = PermissionGateAdapter(connection).permission_gate(message_id, "KIRA", "s", "a", "t")
        self.assertEqual(connection.value.executed,
                         (PermissionGateAdapter.SQL, (message_id, "KIRA", "s", "a", "t")))
        self.assertEqual(got, response())


if __name__ == "__main__": unittest.main()
