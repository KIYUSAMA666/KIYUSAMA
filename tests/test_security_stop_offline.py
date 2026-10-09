"""Offline regression checks for the security-stop guard. No Browserless or SEND."""
import pathlib
import subprocess
import sys
import unittest

WORKFLOW = pathlib.Path(__file__).resolve().parents[1] / ".github/workflows/external-body-adapter-dispatch.yml"

class SecurityStopTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")
        cls.start = cls.workflow.index("              security_markers = (")
        cls.end = cls.workflow.index('              print(f"ROUTE_CLASS=', cls.start)
        cls.block = cls.workflow[cls.start:cls.end]
        cls.guard = cls.block[cls.block.index('              print(f"SECURITY_CHECK_SIGNAL='):]

    def test_guard_precedes_downstream_diagnostics(self):
        self.assertIn('raise SystemExit("SECURITY_CHECK_DETECTED")', self.guard)
        self.assertLess(self.workflow.index('raise SystemExit("SECURITY_CHECK_DETECTED")'),
                        self.workflow.index('print(f"ROUTE_CLASS='))

    def test_true_exits_nonzero_without_downstream_or_send(self):
        code = """
security_signal = True
security_frame_signal = True
security_text_signal = False
class Browser:
    def close(self):
        print("BROWSER_CLOSED")
browser = Browser()
""" + "\n".join(line[14:] for line in self.guard.splitlines()) + """
print("DOWNSTREAM_DIAGNOSTIC")
print("SEND")
"""
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SECURITY_CHECK_SIGNAL=True", result.stdout)
        self.assertIn("SECURITY_SIGNAL_SOURCE=FRAME", result.stdout)
        self.assertIn("BROWSER_CLOSED", result.stdout)
        self.assertIn("SECURITY_CHECK_DETECTED", result.stderr)
        self.assertNotIn("DOWNSTREAM_DIAGNOSTIC", result.stdout)
        self.assertNotIn("SEND", result.stdout)

    def test_false_does_not_claim_auth_success(self):
        code = """
security_signal = False
security_frame_signal = False
security_text_signal = False
class Browser:
    def close(self):
        print("BROWSER_CLOSED")
browser = Browser()
""" + "\n".join(line[14:] for line in self.guard.splitlines()) + """
print("DOWNSTREAM_DIAGNOSTIC")
"""
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("DOWNSTREAM_DIAGNOSTIC", result.stdout)
        self.assertNotIn("BROWSER_CLOSED", result.stdout)
        self.assertNotIn("AUTH_SUCCESS", result.stdout)

if __name__ == "__main__":
    unittest.main()
