import unittest
from datetime import datetime, timezone
from external_body_adapter import Binding, Operation, State, confirm_send, GuardViolation
from external_body_capture_checkpoint import make_capture_checkpoint, validate_resume, capture_wait_policy

class CaptureCheckpointTests(unittest.TestCase):
    def setUp(self):
        self.b=Binding("chatgpt","c-1","https://chatgpt.com/c/c-1","space-1","h0",7)
        self.sent=confirm_send(Operation("evt-1","sha256:x","OP-1",self.b))
    def test_checkpoint_preserves_exact_send_identity(self):
        cp=make_capture_checkpoint(self.sent,generation_running=True,reason="generation_running",observed_at="2026-09-24T00:00:00+00:00")
        validate_resume(self.sent,cp)
        self.assertEqual(cp.state,State.SEND_CONFIRMED); self.assertEqual(cp.marker,"OP-1")
    def test_resume_wrong_conversation_fails_closed(self):
        cp=make_capture_checkpoint(self.sent,generation_running=False,reason="response_not_terminal")
        other=Operation("evt-1","sha256:x","OP-1",Binding("chatgpt","c-2","https://chatgpt.com/c/c-2","space-1","h0",7),state=State.SEND_CONFIRMED)
        with self.assertRaises(GuardViolation): validate_resume(other,cp)
    def test_checkpoint_never_grants_prepared_send_authority(self):
        prepared=Operation("evt-1","sha256:x","OP-1",self.b)
        with self.assertRaises(GuardViolation): make_capture_checkpoint(prepared,generation_running=True,reason="generation_running")
    def test_world_wait_policy_pauses_after_thirty_minutes(self):
        cp=make_capture_checkpoint(self.sent,generation_running=False,reason="response_not_terminal",observed_at="2026-09-24T00:00:00+00:00")
        now=int(datetime(2026,9,24,0,31,tzinfo=timezone.utc).timestamp()*1000)
        delay,pause=capture_wait_policy(cp,now)
        self.assertEqual(delay,30000); self.assertTrue(pause)
    def test_active_generation_uses_short_observation_delay(self):
        cp=make_capture_checkpoint(self.sent,generation_running=True,reason="generation_running",observed_at="2026-09-24T00:00:00+00:00")
        delay,pause=capture_wait_policy(cp,9999999999999)
        self.assertEqual((delay,pause),(250,False))

if __name__=="__main__": unittest.main()
