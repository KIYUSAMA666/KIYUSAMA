import unittest

from managed_kira import CODEX_K_PR_REQUIRED, ManagedKiraLane, ToolRequest


class MemoryAudit:
    def __init__(self): self.rows = {}
    def get(self, request_id): return self.rows.get(request_id)
    def append(self, record):
        if record["request_id"] in self.rows: raise AssertionError("immutable duplicate")
        self.rows[record["request_id"]] = dict(record)


class Gate:
    def __init__(self, decision="ALLOW", malformed=False, unavailable=False):
        self.decision, self.malformed, self.unavailable, self.calls = decision, malformed, unavailable, []
    def evaluate(self, **fields):
        self.calls.append(fields)
        if self.unavailable: raise ConnectionError
        if self.malformed: return {"decision": "MAYBE"}
        return {"decision": self.decision, "decision_id": "d-1", "evidence": {"rule": "fixture"}}


class ManagedKiraTests(unittest.TestCase):
    def make(self, gate=None, wake=True):
        audit, executions = MemoryAudit(), []
        lane = ManagedKiraLane(verify_managed_wake=lambda _: wake, gate=gate or Gate(), audit=audit,
                               read_review=lambda target: executions.append(target) or {"record": target})
        return lane, audit, executions
    def req(self, **changes):
        values = dict(request_id="r1", tool="common_memory.review", target="fact/7", managed_wake={"signed": True})
        values.update(changes); return ToolRequest(**values)

    def test_exactly_one_read_review_tool_and_allow(self):
        gate = Gate("ALLOW"); lane, audit, ran = self.make(gate)
        self.assertEqual(lane.tools(), ("common_memory.review",))
        result = lane.dispatch(self.req())
        self.assertEqual(result["status"], "EXECUTED"); self.assertEqual(ran, ["fact/7"])
        self.assertEqual(gate.calls[0], {"actor": "KIRA_MANAGED", "declared_scope": "COMMON_MEMORY_AUDIT",
                                        "action_kind": "READ_REVIEW", "target_class": "COMMON_MEMORY_RECORD"})
        self.assertEqual(audit.rows["r1"]["decision_id"], "d-1")

    def test_code_change_routes_to_codex_k_without_execution(self):
        lane, _, ran = self.make(Gate("ROUTE")); result = lane.dispatch(self.req(tool="code.change"))
        self.assertEqual(result["status"], CODEX_K_PR_REQUIRED); self.assertFalse(ran)

    def test_critical_classes_deny(self):
        for operation in ("secret", "main", "publish", "billing"):
            with self.subTest(operation=operation):
                lane, _, ran = self.make(Gate("DENY"))
                tool = {"secret": "secret.read", "main": "main.change", "publish": "publish",
                        "billing": "billing.change"}[operation]
                result = lane.dispatch(self.req(request_id=operation, tool=tool))
                self.assertEqual(result["status"], "HUMAN_BLOCKED"); self.assertFalse(ran)

    def test_mislabeled_safe_collab_cannot_select_a_critical_tool(self):
        lane, _, ran = self.make(Gate("DENY"))
        result = lane.dispatch(self.req(tool="SAFE_COLLAB.publish"))
        self.assertEqual(result["status"], "HUMAN_BLOCKED"); self.assertFalse(ran)

    def test_unclassified_fails_closed(self):
        lane, _, ran = self.make(); result = lane.dispatch(self.req(tool="unknown"))
        self.assertEqual(result["evidence"]["reason"], "UNCLASSIFIED"); self.assertFalse(ran)

    def test_wrong_actor_denies_even_if_gate_allows(self):
        lane, _, ran = self.make(); result = lane.dispatch(self.req(asserted_actor="SORA"))
        self.assertEqual(result["evidence"]["reason"], "WRONG_ACTOR"); self.assertFalse(ran)

    def test_gate_unavailable_and_malformed_deny(self):
        for gate in (Gate(unavailable=True), Gate(malformed=True)):
            lane, audit, ran = self.make(gate); result = lane.dispatch(self.req())
            self.assertEqual(result["status"], "HUMAN_BLOCKED"); self.assertFalse(ran)
            self.assertTrue(audit.rows["r1"]["decision_id"].startswith("fail-closed-"))

    def test_invalid_wake_denies_before_gate(self):
        gate = Gate(); lane, _, ran = self.make(gate, wake=False); result = lane.dispatch(self.req())
        self.assertEqual(result["status"], "HUMAN_BLOCKED"); self.assertFalse(gate.calls); self.assertFalse(ran)

    def test_duplicate_request_is_idempotent(self):
        gate = Gate(); lane, audit, ran = self.make(gate)
        first = lane.dispatch(self.req()); second = lane.dispatch(self.req())
        self.assertEqual(first, second); self.assertEqual(len(gate.calls), 1)
        self.assertEqual(ran, ["fact/7"]); self.assertEqual(len(audit.rows), 1)

    def test_read_failure_is_audited_and_closed(self):
        audit, gate = MemoryAudit(), Gate()
        lane = ManagedKiraLane(verify_managed_wake=lambda _: True, gate=gate, audit=audit,
                               read_review=lambda _: (_ for _ in ()).throw(RuntimeError()))
        result = lane.dispatch(self.req())
        self.assertEqual(result["status"], "HUMAN_BLOCKED")
        self.assertEqual(audit.rows["r1"]["decision_id"], "d-1")


if __name__ == "__main__": unittest.main()
