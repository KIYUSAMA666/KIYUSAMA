import unittest
from external_body_adapter import Binding,GuardViolation
from external_body_browser_runtime import BrowserRuntimeEndpoint
from external_body_real_browser_qualification import QualificationObservation,qualify_read_only

class QualificationTests(unittest.TestCase):
    def setUp(self):
        self.e=BrowserRuntimeEndpoint("http://127.0.0.1:19825","local",False,True)
        self.b=Binding("claude","cid","https://claude.ai/chat/cid","claude:kira","h0",7)
    def obs(self,**kw):
        d=dict(daemon_reachable=True,extension_connected=True,exact_tab_bound=True,current_url=self.b.canonical_url,logged_in=True,composer_visible=True,observed_head="h0");d.update(kw);return QualificationObservation(**d)
    def test_exact_existing_body_qualifies_read_only(self):
        q=qualify_read_only(self.e,self.b,self.obs());self.assertEqual(q.conversation_id,"cid")
    def test_no_extension_fails(self):
        with self.assertRaises(GuardViolation): qualify_read_only(self.e,self.b,self.obs(extension_connected=False))
    def test_unbound_tab_fails(self):
        with self.assertRaises(GuardViolation): qualify_read_only(self.e,self.b,self.obs(exact_tab_bound=False))
    def test_wrong_conversation_fails(self):
        with self.assertRaises(GuardViolation): qualify_read_only(self.e,self.b,self.obs(current_url="https://claude.ai/chat/other"))
    def test_head_changed_fails(self):
        with self.assertRaises(GuardViolation): qualify_read_only(self.e,self.b,self.obs(observed_head="h1"))

if __name__=="__main__": unittest.main()
