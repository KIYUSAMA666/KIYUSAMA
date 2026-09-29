"""Read-only qualification gate before the first real external-body Send.

World pattern: bridge health -> extension connected -> bind the already-open
authenticated tab -> READ current page -> prove exact conversation/head ->
only then allow the existing guarded Send path. Qualification itself can never
Send or compose.
"""
from dataclasses import dataclass
from external_body_adapter import Binding, GuardViolation
from external_body_browser_runtime import BrowserRuntimeEndpoint, runtime_ready
from external_body_claude_provider import validate_claude_page

@dataclass(frozen=True)
class QualificationObservation:
    daemon_reachable: bool
    extension_connected: bool
    exact_tab_bound: bool
    current_url: str
    logged_in: bool
    composer_visible: bool
    observed_head: str

@dataclass(frozen=True)
class QualifiedClaudeBody:
    conversation_id: str
    canonical_url: str
    browser_space_id: str
    observed_head: str
    lease_revision: int

def qualify_read_only(endpoint:BrowserRuntimeEndpoint,binding:Binding,obs:QualificationObservation)->QualifiedClaudeBody:
    if not runtime_ready(endpoint,daemon_reachable=obs.daemon_reachable,extension_connected=obs.extension_connected,exact_tab_bound=obs.exact_tab_bound):
        raise GuardViolation("real browser runtime not ready")
    validate_claude_page(binding,current_url=obs.current_url,logged_in=obs.logged_in,composer_visible=obs.composer_visible)
    if not obs.observed_head or obs.observed_head!=binding.observed_head:
        raise GuardViolation("read-only qualification head mismatch")
    return QualifiedClaudeBody(binding.conversation_id,binding.canonical_url,binding.browser_space_id,binding.observed_head,binding.lease_revision)
