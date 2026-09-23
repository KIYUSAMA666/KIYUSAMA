import unittest
from external_body_adapter import Binding, GuardViolation
from external_body_claude_capture import ClaudeMessage, ClaudeCaptureEvidence, exact_claude_exchange

class ClaudeCaptureTests(unittest.TestCase):
    def setUp(self):
        self.b=Binding("claude","cid","https://claude.ai/chat/cid","space","h0",1)
        self.ms=(ClaudeMessage("old","assistant","old"),ClaudeMessage("u1","user","work [OP-1]"),ClaudeMessage("a1","assistant","done"))
    def ev(self,**kw):
        d=dict(current_url=self.b.canonical_url,logged_in=True,composer_visible=True,streaming=False,messages=self.ms,previous_assistant_text="old",stable_observations=3);d.update(kw);return ClaudeCaptureEvidence(**d)
    def test_exact_marked_pair_is_attributable(self):
        p,a=exact_claude_exchange(self.b,marker="OP-1",evidence=self.ev());self.assertEqual((p.message_id,a.message_id),("u1","a1"))
    def test_streaming_never_captures(self):
        with self.assertRaises(GuardViolation): exact_claude_exchange(self.b,marker="OP-1",evidence=self.ev(streaming=True))
    def test_requires_three_stable_observations(self):
        with self.assertRaises(GuardViolation): exact_claude_exchange(self.b,marker="OP-1",evidence=self.ev(stable_observations=2))
    def test_duplicate_marked_user_turn_fails_closed(self):
        ms=self.ms+(ClaudeMessage("u2","user","again OP-1"),)
        with self.assertRaises(GuardViolation): exact_claude_exchange(self.b,marker="OP-1",evidence=self.ev(messages=ms))
    def test_multiple_following_assistant_messages_are_ambiguous(self):
        ms=self.ms+(ClaudeMessage("a2","assistant","extra"),)
        with self.assertRaises(GuardViolation): exact_claude_exchange(self.b,marker="OP-1",evidence=self.ev(messages=ms))
    def test_same_previous_response_is_not_progress(self):
        with self.assertRaises(GuardViolation): exact_claude_exchange(self.b,marker="OP-1",evidence=self.ev(previous_assistant_text="done"))
    def test_wrong_conversation_fails_closed(self):
        with self.assertRaises(GuardViolation): exact_claude_exchange(self.b,marker="OP-1",evidence=self.ev(current_url="https://claude.ai/chat/other"))

if __name__=="__main__": unittest.main()
