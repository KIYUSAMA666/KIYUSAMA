import unittest

from internal_team_capability_lane import (
    Capability,
    GuardedCapabilityBinding,
    InternalIdentity,
    InternalTeamCapabilityLane,
    VerifiedInternalWake,
)
from kira_audit_lane import GateDecision, PermissionDenied


ROUTES = {
    Capability.REPOSITORY_INSPECT: "GITHUB_GUARDED_READ",
    Capability.SUPABASE_DB_INSPECT: "SUPABASE_GUARDED_READ",
    Capability.SUPABASE_EDGE_INSPECT: "SUPABASE_GUARDED_READ",
    Capability.SUPABASE_LOG_INSPECT: "SUPABASE_GUARDED_READ",
    Capability.CODEX_S_IMPLEMENT: "CODEX_S_PR_REQUIRED",
    Capability.CODEX_K_VERIFY: "CODEX_K_PR_REQUIRED",
    Capability.OPEN_ROOM_READ: "OPEN_ROOM_GUARDED_READ",
    Capability.OPEN_ROOM_WRITEBACK: "OPEN_ROOM_GUARDED_WRITEBACK",
}


class RecordingGate:
    def __init__(self):
        self.calls = []
        self.denied = False
        self.route_override = None

    def evaluate(self, message_id, actor, scope, action, target):
        self.calls.append((message_id, actor, scope, action, target))
        capability = next(c for c in Capability if c.value == (action, target))
        route = self.route_override or ROUTES[capability]
        return GateDecision(not self.denied, 9007199254741091,
                            "DENY" if self.denied else "ROUTE", route, "TEST")


class InternalTeamLaneTests(unittest.TestCase):
    def make_lane(self, identity, events, gate=None):
        gate = gate or RecordingGate()

        def verify(message_id, claim):
            events.append(("wake", message_id, claim))
            return VerifiedInternalWake(identity, "MANAGED_WAKE")

        def handler(request, audit):
            events.append(("dispatch", request, audit))
            return audit

        bindings = {
            capability: GuardedCapabilityBinding(ROUTES[capability], handler)
            for capability in Capability
        }
        return InternalTeamCapabilityLane(gate, verify, bindings), gate

    def test_all_existing_inspection_and_room_routes_preserve_identity_and_audit(self):
        shared = {
            Capability.REPOSITORY_INSPECT,
            Capability.SUPABASE_DB_INSPECT,
            Capability.SUPABASE_EDGE_INSPECT,
            Capability.SUPABASE_LOG_INSPECT,
            Capability.OPEN_ROOM_READ,
            Capability.OPEN_ROOM_WRITEBACK,
        }
        for identity in InternalIdentity:
            for capability in shared:
                with self.subTest(identity=identity, capability=capability):
                    events = []
                    lane, gate = self.make_lane(identity, events)
                    audit = lane.execute("m-1", "signed-claim", capability, {"q": "safe"})
                    self.assertEqual(audit.actor, identity.value)
                    self.assertEqual(audit.decision_id, 9007199254741091)
                    self.assertEqual(audit.gate_route, ROUTES[capability])
                    self.assertEqual(gate.calls[0][1], identity.value)
                    self.assertEqual(events[0], ("wake", "m-1", "signed-claim"))
                    self.assertNotIn("signed-claim", events[1])

    def test_codex_lanes_are_identity_separated(self):
        cases = (
            (InternalIdentity.SORA, Capability.CODEX_S_IMPLEMENT),
            (InternalIdentity.KIRA, Capability.CODEX_K_VERIFY),
        )
        for identity, capability in cases:
            lane, gate = self.make_lane(identity, [])
            self.assertEqual(lane.execute("m", "claim", capability).gate_route,
                             ROUTES[capability])
            self.assertEqual(len(gate.calls), 1)

        for identity, capability in (
            (InternalIdentity.SORA, Capability.CODEX_K_VERIFY),
            (InternalIdentity.KIRA, Capability.CODEX_S_IMPLEMENT),
        ):
            lane, gate = self.make_lane(identity, [])
            with self.assertRaises(PermissionDenied):
                lane.execute("m", "claim", capability)
            self.assertEqual(gate.calls, [])

    def test_missing_binding_denial_and_gate_denial_never_dispatch(self):
        gate = RecordingGate()
        calls = []
        lane = InternalTeamCapabilityLane(
            gate,
            lambda *_: VerifiedInternalWake(InternalIdentity.SORA, "MANAGED_WAKE"),
            {},
        )
        with self.assertRaises(PermissionDenied):
            lane.execute("m", "claim", Capability.REPOSITORY_INSPECT)
        self.assertEqual(gate.calls, [])

        lane, gate = self.make_lane(InternalIdentity.SORA, calls, gate)
        gate.denied = True
        with self.assertRaises(PermissionDenied):
            lane.execute("m", "claim", Capability.REPOSITORY_INSPECT)
        self.assertFalse(any(event[0] == "dispatch" for event in calls))

    def test_route_confusion_is_denied_and_not_dispatched(self):
        events = []
        gate = RecordingGate()
        gate.route_override = "CODEX_K_PR_REQUIRED"
        lane, _ = self.make_lane(InternalIdentity.SORA, events, gate)
        with self.assertRaises(PermissionDenied):
            lane.execute("m", "claim", Capability.CODEX_S_IMPLEMENT)
        self.assertFalse(any(event[0] == "dispatch" for event in events))

    def test_unverified_identity_and_unlisted_privileged_intents_fail_closed(self):
        lane = InternalTeamCapabilityLane(RecordingGate(), lambda *_: None, {})
        with self.assertRaises(PermissionDenied):
            lane.execute("m", "claim", Capability.REPOSITORY_INSPECT)
        forged = InternalTeamCapabilityLane(
            RecordingGate(),
            lambda *_: VerifiedInternalWake("SORA_INTERNAL", "MANAGED_WAKE"),
            {},
        )
        with self.assertRaises(PermissionDenied):
            forged.execute("m", "claim", Capability.REPOSITORY_INSPECT)
        with self.assertRaises(TypeError):
            lane.execute("m", "claim", ("SECRET_READ", "SECRET"))
        self.assertNotIn(("SECRET_READ", "SECRET"), [c.value for c in Capability])
        self.assertNotIn(("MAIN_DIRECT_WRITE", "MAIN"), [c.value for c in Capability])
        self.assertNotIn(("PERMISSION_CHANGE", "AUTH"), [c.value for c in Capability])


if __name__ == "__main__":
    unittest.main()
