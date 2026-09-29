import unittest
from external_body_adapter import GuardViolation
from external_body_session_lease import acquire_write_lease,verify_write_lease,release_write_lease,transport_retry_identity

class BodyLeaseTests(unittest.TestCase):
    def test_exact_holder_can_drive_bound_session(self):
        l=acquire_write_lease(session_key="claude:kira",holder_id="op-1",revision=7)
        verify_write_lease(l,session_key="claude:kira",holder_id="op-1",revision=7)
    def test_second_writer_fails_closed(self):
        l=acquire_write_lease(session_key="claude:kira",holder_id="op-1",revision=7)
        with self.assertRaises(GuardViolation): verify_write_lease(l,session_key="claude:kira",holder_id="op-2",revision=7)
    def test_fence_change_fails_closed(self):
        l=acquire_write_lease(session_key="claude:kira",holder_id="op-1",revision=7)
        with self.assertRaises(GuardViolation): verify_write_lease(l,session_key="claude:kira",holder_id="op-1",revision=8)
    def test_release_is_holder_only_and_final(self):
        l=acquire_write_lease(session_key="claude:kira",holder_id="op-1",revision=7)
        with self.assertRaises(GuardViolation): release_write_lease(l,holder_id="op-2")
        l=release_write_lease(l,holder_id="op-1")
        with self.assertRaises(GuardViolation): verify_write_lease(l,session_key="claude:kira",holder_id="op-1",revision=7)
    def test_unknown_outcome_forces_read_only_reconcile(self):
        self.assertEqual(transport_retry_identity(original_command_id="cmd-1",retry_command_id="cmd-1",outcome_known_absent=False),"RECONCILE_READ_ONLY")
    def test_proven_absence_keeps_same_command_identity(self):
        self.assertEqual(transport_retry_identity(original_command_id="cmd-1",retry_command_id="cmd-1",outcome_known_absent=True),"RETRY_SAME_COMMAND_ID")
    def test_changed_command_id_is_never_transport_retry(self):
        with self.assertRaises(GuardViolation): transport_retry_identity(original_command_id="cmd-1",retry_command_id="cmd-2",outcome_known_absent=True)

if __name__=="__main__": unittest.main()
