import unittest
from step6_return_outer_canary import ActorBinding, exact_url, resolve_tab, verify_receipt

class TestOuterCanary(unittest.TestCase):
    def setUp(self): self.b=ActorBinding("SORA_03","REAL-ID")
    def test_exact_url(self): self.assertEqual(exact_url(self.b),"https://chatgpt.com/c/REAL-ID")
    def test_stale_plus_live_resolves_live(self):
        self.assertEqual(resolve_tab(["https://chatgpt.com/c/OLD",exact_url(self.b)],self.b),exact_url(self.b))
    def test_duplicate_exact_fails(self):
        with self.assertRaises(RuntimeError): resolve_tab([exact_url(self.b),exact_url(self.b)],self.b)
    def test_missing_exact_fails(self):
        with self.assertRaises(RuntimeError): resolve_tab(["https://chatgpt.com/c/OLD"],self.b)
    def test_receipt_actor_mismatch_fails(self):
        with self.assertRaises(RuntimeError): verify_receipt([], [{"turn_id":"T1","actor_id":"SORA_04","role":"assistant"}],"SORA_03")
    def test_receipt_pass(self):
        self.assertEqual(verify_receipt([], [{"turn_id":"T1","actor_id":"SORA_03","role":"assistant"}],"SORA_03")["turn_id"],"T1")

if __name__=="__main__": unittest.main()
