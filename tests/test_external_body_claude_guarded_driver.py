import unittest
from external_body_adapter import Binding,Operation,State,GuardViolation
from external_body_transport import SendEvidence,ResponseObservation
from external_body_session_lease import acquire_write_lease
from external_body_claude_guarded_driver import ClaudeGuardedDriver

class Surface:
    def __init__(self): self.url="https://claude.ai/chat/cid";self.logged=True;self.composer=True;self.sent=0
    def page_state(self): return self.url,self.logged,self.composer
    def head_fingerprint(self): return "h0"
    def draft_empty(self): return True
    def generation_idle(self): return True
    def compose_exact(self,p,d): self.payload=p
    def send_once_evidence(self,m): self.sent+=1;return SendEvidence(True,self.url,1,1,0)
    def response_evidence(self,m): return ResponseObservation("h0","h1",True,True,self.url,2,"user","assistant",1,1,"u1","a1")

class DriverTests(unittest.TestCase):
    def setUp(self):
        self.b=Binding("claude","cid","https://claude.ai/chat/cid","claude:kira","h0",7)
        self.op=Operation("evt","sha","OP-1",self.b);self.s=Surface();self.l=acquire_write_lease(session_key="claude:kira",holder_id="OP-1",revision=7)
    def driver(self,holder="OP-1"): return ClaudeGuardedDriver(self.b,self.l,holder,self.s)
    def test_exact_world_path_send_then_capture(self):
        d=self.driver();sent=d.send_operation(self.op,"work OP-1");self.assertEqual(sent.state,State.SEND_CONFIRMED);self.assertEqual(self.s.sent,1)
        cap=d.capture_operation(sent);self.assertEqual(cap.state,State.CAPTURED);self.assertEqual(self.s.sent,1)
    def test_wrong_writer_never_sends(self):
        with self.assertRaises(GuardViolation): self.driver("OP-2").send_operation(self.op,"work OP-1")
        self.assertEqual(self.s.sent,0)
    def test_wrong_conversation_never_sends(self):
        self.s.url="https://claude.ai/chat/other"
        with self.assertRaises(GuardViolation): self.driver().send_operation(self.op,"work OP-1")
        self.assertEqual(self.s.sent,0)
    def test_logged_out_never_sends(self):
        self.s.logged=False
        with self.assertRaises(GuardViolation): self.driver().send_operation(self.op,"work OP-1")
        self.assertEqual(self.s.sent,0)

if __name__=="__main__": unittest.main()
