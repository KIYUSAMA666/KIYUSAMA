import unittest
from external_body_adapter import Binding, GuardViolation
from external_body_claude_provider import claude_target, validate_claude_page

class ClaudeProviderTests(unittest.TestCase):
    def setUp(self):
        self.b=Binding("claude","123e4567-e89b-12d3-a456-426614174000","https://claude.ai/chat/123e4567-e89b-12d3-a456-426614174000","space-kira","h0",4)
    def test_exact_existing_conversation_is_accepted(self):
        t=claude_target(self.b); self.assertEqual(t.conversation_id,self.b.conversation_id)
        validate_claude_page(self.b,current_url=self.b.canonical_url,logged_in=True,composer_visible=True)
    def test_new_or_other_conversation_is_rejected(self):
        with self.assertRaises(GuardViolation): validate_claude_page(self.b,current_url="https://claude.ai/new",logged_in=True,composer_visible=True)
        with self.assertRaises(GuardViolation): validate_claude_page(self.b,current_url="https://claude.ai/chat/other",logged_in=True,composer_visible=True)
    def test_logged_out_fails_closed(self):
        with self.assertRaises(GuardViolation): validate_claude_page(self.b,current_url=self.b.canonical_url,logged_in=False,composer_visible=True)
    def test_missing_composer_fails_closed(self):
        with self.assertRaises(GuardViolation): validate_claude_page(self.b,current_url=self.b.canonical_url,logged_in=True,composer_visible=False)
    def test_binding_id_must_match_url_id(self):
        bad=Binding("claude","other",self.b.canonical_url,"space-kira","h0",4)
        with self.assertRaises(GuardViolation): claude_target(bad)
    def test_query_or_fragment_cannot_mutate_identity(self):
        bad=Binding("claude",self.b.conversation_id,self.b.canonical_url+"?x=1","space-kira","h0",4)
        with self.assertRaises(GuardViolation): claude_target(bad)

if __name__=="__main__": unittest.main()
