import unittest
from external_body_adapter import GuardViolation
from external_body_browser_runtime import BrowserRuntimeEndpoint,validate_runtime_endpoint,runtime_ready

class BrowserRuntimeTests(unittest.TestCase):
    def test_local_logged_in_browser_boundary(self):
        e=BrowserRuntimeEndpoint("http://127.0.0.1:19825","local",False,True)
        self.assertTrue(runtime_ready(e,daemon_reachable=True,extension_connected=True,exact_tab_bound=True))
    def test_world_remote_pattern_requires_authenticated_reverse_tunnel(self):
        e=BrowserRuntimeEndpoint("http://127.0.0.1:19825","ssh-reverse",True,True)
        self.assertTrue(runtime_ready(e,daemon_reachable=True,extension_connected=True,exact_tab_bound=True))
    def test_public_daemon_is_rejected(self):
        e=BrowserRuntimeEndpoint("http://example.com:19825","local",False,True)
        with self.assertRaises(GuardViolation): validate_runtime_endpoint(e)
    def test_unauthenticated_remote_tunnel_is_rejected(self):
        e=BrowserRuntimeEndpoint("http://127.0.0.1:19825","ssh-reverse",False,True)
        with self.assertRaises(GuardViolation): validate_runtime_endpoint(e)
    def test_cookie_export_is_rejected(self):
        e=BrowserRuntimeEndpoint("http://127.0.0.1:19825","local",False,True,True)
        with self.assertRaises(GuardViolation): validate_runtime_endpoint(e)
    def test_not_ready_until_exact_existing_tab_is_bound(self):
        e=BrowserRuntimeEndpoint("http://127.0.0.1:19825","local",False,True)
        self.assertFalse(runtime_ready(e,daemon_reachable=True,extension_connected=True,exact_tab_bound=False))

if __name__=="__main__": unittest.main()
