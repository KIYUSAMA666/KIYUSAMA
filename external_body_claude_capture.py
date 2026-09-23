"""World-grounded Claude response attribution for the external KIRA body.

OpenCLI supplies the real Claude.ai message surfaces and streaming signal.
Ego Chat supplies the stricter exact-turn rule: never accept merely "a new
assistant bubble"; the uniquely marked user turn must be present exactly once
and the response must be stable before the generic capture guard may consume it.
"""
from dataclasses import dataclass
from external_body_adapter import Binding, GuardViolation
from external_body_claude_provider import validate_claude_page

@dataclass(frozen=True)
class ClaudeMessage:
    message_id: str
    role: str
    text: str

@dataclass(frozen=True)
class ClaudeCaptureEvidence:
    current_url: str
    logged_in: bool
    composer_visible: bool
    streaming: bool
    messages: tuple[ClaudeMessage, ...]
    previous_assistant_text: str | None = None
    stable_observations: int = 0

def exact_claude_exchange(binding: Binding, *, marker: str, evidence: ClaudeCaptureEvidence) -> tuple[ClaudeMessage, ClaudeMessage]:
    validate_claude_page(binding,current_url=evidence.current_url,logged_in=evidence.logged_in,composer_visible=evidence.composer_visible)
    if evidence.streaming:
        raise GuardViolation("Claude response still streaming")
    if evidence.stable_observations < 3:
        raise GuardViolation("Claude response not yet stable")
    marked=[(i,m) for i,m in enumerate(evidence.messages) if m.role=="user" and m.text.count(marker)==1]
    if len(marked)!=1:
        raise GuardViolation("Claude exact marked user turn not unique")
    i,prompt=marked[0]
    if not prompt.message_id:
        raise GuardViolation("Claude prompt message identity missing")
    following=[m for m in evidence.messages[i+1:] if m.role=="assistant"]
    if len(following)!=1:
        raise GuardViolation("Claude exact assistant response not attributable")
    response=following[0]
    if not response.message_id or response.message_id==prompt.message_id:
        raise GuardViolation("Claude response identity invalid")
    if not response.text.strip() or response.text==evidence.previous_assistant_text:
        raise GuardViolation("Claude response did not advance")
    return prompt,response
