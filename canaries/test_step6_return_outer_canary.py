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


class TestTabIdentityDrift(unittest.TestCase):
    def test_cached_handle_becomes_stale_after_navigation(self):
        b=ActorBinding("SORA_03","REAL-ID")
        cached_url=exact_url(b)
        current_urls=["https://chatgpt.com/c/OTHER-ID", exact_url(b)]
        # A cached identity alone is not proof after navigation.
        self.assertEqual(cached_url, exact_url(b))
        self.assertEqual(resolve_tab(current_urls,b), exact_url(b))

    def test_navigation_without_exact_target_fails_closed(self):
        b=ActorBinding("SORA_03","REAL-ID")
        with self.assertRaisesRegex(RuntimeError,"EXACT_TAB_RESOLUTION_FAIL"):
            resolve_tab(["https://chatgpt.com/c/OTHER-ID"],b)

    def test_actor_receipt_cannot_be_reused_after_drift(self):
        before=[{"turn_id":"OLD","actor_id":"SORA_03","role":"assistant"}]
        after=before+[{"turn_id":"NEW","actor_id":"SORA_04","role":"assistant"}]
        with self.assertRaisesRegex(RuntimeError,"DELIVERY_READBACK_FAIL"):
            verify_receipt(before,after,"SORA_03")
