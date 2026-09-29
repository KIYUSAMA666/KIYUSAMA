"""Provider contract for the external KIRA body (Claude.ai).

Provider-facing facts are copied from the world implementation (OpenCLI):
persistent authenticated claude.ai session, /chat/<id>, chat-input composer,
user-message and font-claude-response message surfaces.

This module intentionally does not grant Send authority by itself. The generic
external-body state machine remains authoritative for exact binding, fencing,
at-most-once Send, reconciliation and capture.
"""
from dataclasses import dataclass
from urllib.parse import urlparse
from external_body_adapter import Binding, GuardViolation

CLAUDE_HOST = "claude.ai"
CLAUDE_COMPOSER_SELECTOR = '[data-testid="chat-input"]'
CLAUDE_USER_MESSAGE_SELECTOR = '[data-testid="user-message"]'
CLAUDE_ASSISTANT_MESSAGE_SELECTOR = ".font-claude-response"

@dataclass(frozen=True)
class ClaudeConversationTarget:
    conversation_id: str
    canonical_url: str

def claude_target(binding: Binding) -> ClaudeConversationTarget:
    if binding.provider.lower() not in ("claude", "claude.ai"):
        raise GuardViolation("binding is not external KIRA/Claude")
    parsed=urlparse(binding.canonical_url)
    if parsed.scheme != "https" or parsed.hostname != CLAUDE_HOST:
        raise GuardViolation("Claude canonical URL must be https://claude.ai")
    parts=[p for p in parsed.path.split("/") if p]
    if len(parts) != 2 or parts[0] != "chat" or parts[1] != binding.conversation_id:
        raise GuardViolation("Claude conversation identity mismatch")
    if parsed.query or parsed.fragment:
        raise GuardViolation("Claude canonical URL must not carry query/fragment identity")
    return ClaudeConversationTarget(binding.conversation_id,binding.canonical_url)

def validate_claude_page(binding: Binding, *, current_url: str, logged_in: bool, composer_visible: bool) -> None:
    claude_target(binding)
    if not logged_in:
        raise GuardViolation("Claude authenticated browser session required")
    if current_url != binding.canonical_url:
        raise GuardViolation("Claude existing conversation changed")
    if not composer_visible:
        raise GuardViolation("Claude composer unavailable")
