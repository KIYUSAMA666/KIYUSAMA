import unittest
from external_body_adapter import Binding, Operation, State, GuardViolation
from external_body_transport import BrowserObservation, SendEvidence, ResponseObservation, send_once, capture_read_only

class FakeDriver:
    def __init__(self, binding, authenticated=True, confirmed=True):
        self.authenticated=authenticated; self.confirmed=confirmed; self.send_clicks=0; self.composes=0
    def observe(self,b):
        return BrowserObservation(b.canonical_url,b.observed_head,b.lease_revision,self.authenticated,True,True)
    def compose_and_verify(self,b,payload,digest): self.composes += 1
    def click_send_once(self,b):
        self.send_clicks += 1; return SendEvidence(self.confirmed)
    def observe_response_read_only(self,b,marker):
        return ResponseObservation(b.observed_head,"h1",True,True)

class TransportTests(unittest.TestCase):
    def setUp(self):
        self.b=Binding("chatgpt","c-1","https://chatgpt.com/c/c-1","space-1","h0",7)
        self.op=Operation("evt-1","sha256:x","OP-1",self.b)
    def test_confirmed_send_clicks_once(self):
        d=FakeDriver(self.b); sent=send_once(self.op,"hello",d)
        self.assertEqual(sent.state,State.SEND_CONFIRMED); self.assertEqual(d.send_clicks,1)
    def test_ambiguous_send_never_retries(self):
        d=FakeDriver(self.b,confirmed=False); uncertain=send_once(self.op,"hello",d)
        self.assertEqual(uncertain.state,State.RECONCILE)
        with self.assertRaises(GuardViolation): send_once(uncertain,"hello",d)
        self.assertEqual(d.send_clicks,1)
    def test_capture_is_read_only(self):
        d=FakeDriver(self.b); sent=send_once(self.op,"hello",d); done=capture_read_only(sent,d)
        self.assertEqual(done.state,State.CAPTURED); self.assertEqual(d.send_clicks,1); self.assertEqual(d.composes,1)
    def test_auth_failure_stops_before_compose(self):
        d=FakeDriver(self.b,authenticated=False); stopped=send_once(self.op,"hello",d)
        self.assertEqual(stopped.state,State.HUMAN_REQUIRED); self.assertEqual(d.composes,0); self.assertEqual(d.send_clicks,0)

if __name__=="__main__": unittest.main()
