import unittest

from kira_audit_lane import (
    GATE_SQL,
    GateContractError,
    KiraCommonMemoryLane,
    PermissionDenied,
    PostgresPermissionGate,
    SecurityIntent,
)


class ProductionContractGate:
    """Fake whose constants intentionally mirror the verified live SQL contract."""

    def __init__(self):
        self.calls = []
        self.next_id = 2**53 + 87

    def evaluate(self, message_id, actor, scope, action, target):
        self.calls.append((message_id, actor, scope, action, target))
        if actor != "KIRA_MANAGED":
            values = (False, "DENY", "NONE", "UNAUTHORIZED_ACTOR")
        elif scope in {"REVIEW_ONLY", "MANAGED_WAKE"} and (action, target) == (
            "READ",
            "COMMON_MEMORY",
        ):
            values = (True, "ALLOW", "DIRECT", "READ_REVIEW_ALLOWLIST")
        elif (action, target) == ("CODE_EDIT", "REPOSITORY"):
            values = (False, "ROUTE", "CODEX_K_PR_REQUIRED", "CODEX_K_PR_REQUIRED")
        elif (action, target) in {
            ("SECRET_READ", "SECRET"),
            ("MAIN_DIRECT_WRITE", "MAIN"),
            ("EXTERNAL_PUBLISH", "PUBLIC_EXTERNAL"),
            ("BILLING_CHANGE", "BILLING"),
        }:
            values = (False, "DENY", "HUMAN", "HUMAN_APPROVAL_REQUIRED")
        else:
            values = (False, "DENY", "HUMAN", "FAIL_CLOSED_UNCLASSIFIED")
        from kira_audit_lane import GateDecision

        return GateDecision(values[0], self.next_id, *values[1:])


class LaneTests(unittest.TestCase):
    def test_verified_wake_then_gate_then_read_with_server_constants(self):
        events = []
        gate = ProductionContractGate()

        def verify(message_id, claim):
            events.append(("wake", message_id, claim))
            return "MANAGED_WAKE"

        def read(message_id):
            events.append(("read", message_id))
            return ["memory"]

        lane = KiraCommonMemoryLane(gate, verify, read)
        self.assertEqual(lane.read_common_memory("m1", "durable-claim"), ["memory"])
        self.assertEqual(events, [("wake", "m1", "durable-claim"), ("read", "m1")])
        self.assertEqual(
            gate.calls,
            [("m1", "KIRA_MANAGED", "MANAGED_WAKE", "READ", "COMMON_MEMORY")],
        )

    def test_failed_wake_makes_no_gate_call_or_read(self):
        gate = ProductionContractGate()
        reads = []
        lane = KiraCommonMemoryLane(gate, lambda *_: "UNVERIFIED", reads.append)
        with self.assertRaises(PermissionDenied):
            lane.read_common_memory("m1", object())
        self.assertEqual(gate.calls, [])
        self.assertEqual(reads, [])

    def test_route_and_denies_are_gate_only_and_exact(self):
        gate = ProductionContractGate()
        reads = []
        lane = KiraCommonMemoryLane(gate, lambda *_: "REVIEW_ONLY", reads.append)
        expected = {
            SecurityIntent.CODE_ROUTE: ("ROUTE", "CODEX_K_PR_REQUIRED"),
            SecurityIntent.SECRET_DENY: ("DENY", "HUMAN"),
            SecurityIntent.MAIN_DENY: ("DENY", "HUMAN"),
            SecurityIntent.PUBLISH_DENY: ("DENY", "HUMAN"),
            SecurityIntent.BILLING_DENY: ("DENY", "HUMAN"),
            SecurityIntent.UNKNOWN_DENY: ("DENY", "HUMAN"),
        }
        for intent, result in expected.items():
            decision = lane.evaluate_security_intent("m1", intent)
            self.assertEqual((decision.decision, decision.route), result)
        self.assertEqual(reads, [])
        self.assertEqual(gate.calls[-1][3:], ("UNKNOWN", "UNKNOWN"))
        self.assertEqual(
            lane.evaluate_security_intent("m1", SecurityIntent.UNKNOWN_DENY).reason,
            "FAIL_CLOSED_UNCLASSIFIED",
        )

    def test_wrong_actor_contract(self):
        decision = ProductionContractGate().evaluate(
            "m1", "KIRA", "REVIEW_ONLY", "READ", "COMMON_MEMORY"
        )
        self.assertEqual(
            (decision.decision, decision.route, decision.reason),
            ("DENY", "NONE", "UNAUTHORIZED_ACTOR"),
        )


class Cursor:
    def __init__(self, raw):
        self.raw = raw
        self.executed = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def execute(self, sql, params):
        self.executed = (sql, params)

    def fetchone(self):
        return (self.raw,)


class Connection:
    def __init__(self, raw):
        self.cursor_value = Cursor(raw)

    def cursor(self):
        return self.cursor_value


class IntegrationContractTests(unittest.TestCase):
    def test_exact_sql_placeholder_count_and_parameter_order(self):
        raw = {
            "ok": True,
            "decision_id": 9223372036854775807,
            "decision": "ALLOW",
            "route": "DIRECT",
            "reason": "READ_REVIEW_ALLOWLIST",
        }
        connection = Connection(raw)
        result = PostgresPermissionGate(connection).evaluate(
            "uuid", "KIRA_MANAGED", "REVIEW_ONLY", "READ", "COMMON_MEMORY"
        )
        self.assertEqual(GATE_SQL.count("%s"), 5)
        self.assertEqual(
            connection.cursor_value.executed,
            (
                "SELECT public.kira_permission_gate_v1(%s, %s, %s, %s, %s) AS result",
                ("uuid", "KIRA_MANAGED", "REVIEW_ONLY", "READ", "COMMON_MEMORY"),
            ),
        )
        self.assertEqual(result.decision_id, 9223372036854775807)

    def test_parser_rejects_non_bigint_decision_id(self):
        raw = {
            "ok": True,
            "decision_id": 1.0,
            "decision": "ALLOW",
            "route": "DIRECT",
            "reason": "READ_REVIEW_ALLOWLIST",
        }
        with self.assertRaises(GateContractError):
            PostgresPermissionGate(Connection(raw)).evaluate("u", "a", "s", "x", "t")


if __name__ == "__main__":
    unittest.main()
