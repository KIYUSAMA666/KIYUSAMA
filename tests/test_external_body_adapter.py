import unittest
from external_body_adapter import (
    Binding, Operation, State, GuardViolation, verify_before_send,
    confirm_send, mark_ambiguous_send, capture_response, require_human,
)


class ExternalBodyAdapterTests(unittest.TestCase):
    def setUp(self):
        self.b = Binding("chatgpt", "c-1", "https://chatgpt.com/c/c-1", "space-1", "h0", 7)
        self.op = Operation("evt-1", "sha256:x", "OP-1", self.b)

    def test_happy_state_path(self):
        verify_before_send(self.op, canonical_url=self.b.canonical_url,
                           observed_head="h0", lease_revision=7)
        sent = confirm_send(self.op)
        done = capture_response(sent, prior_head="h0", new_head="h1", marker_observed=True)
        self.assertEqual(done.state, State.CAPTURED)
        self.assertEqual(done.captured_head, "h1")

    def test_head_drift_fails_closed(self):
        with self.assertRaises(GuardViolation):
            verify_before_send(self.op, canonical_url=self.b.canonical_url,
                               observed_head="OTHER", lease_revision=7)

    def test_blind_resend_forbidden(self):
        sent = confirm_send(self.op)
        with self.assertRaises(GuardViolation):
            confirm_send(sent)

    def test_ambiguous_send_only_reconciles(self):
        uncertain = mark_ambiguous_send(self.op)
        self.assertEqual(uncertain.state, State.RECONCILE)
        with self.assertRaises(GuardViolation):
            confirm_send(uncertain)

    def test_wrong_response_not_attributed(self):
        sent = confirm_send(self.op)
        with self.assertRaises(GuardViolation):
            capture_response(sent, prior_head="h0", new_head="h1", marker_observed=False)

    def test_auth_boundary_requires_human(self):
        self.assertEqual(require_human(self.op).state, State.HUMAN_REQUIRED)


if __name__ == "__main__":
    unittest.main()
