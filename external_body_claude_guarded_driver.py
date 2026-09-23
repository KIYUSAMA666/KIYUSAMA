"""Compose the world-grounded Claude provider with the guarded transport.

This is the narrow junction from a real Claude.ai browser surface into the
existing at-most-once external-body transport. Provider-specific code supplies
observations/actions; generic transport retains authority for exact binding,
lease revision, Send confirmation, reconciliation and capture.
"""
from typing import Protocol
from external_body_adapter import Binding, Operation, GuardViolation
from external_body_transport import BrowserObservation, SendEvidence, ResponseObservation, send_once, capture_read_only
from external_body_claude_provider import validate_claude_page
from external_body_session_lease import BodyWriteLease, verify_write_lease

class ClaudeBrowserSurface(Protocol):
    def page_state(self) -> tuple[str,bool,bool]: ...
    def head_fingerprint(self) -> str: ...
    def draft_empty(self) -> bool: ...
    def generation_idle(self) -> bool: ...
    def compose_exact(self,payload:str,payload_digest:str) -> None: ...
    def send_once_evidence(self,marker:str) -> SendEvidence: ...
    def response_evidence(self,marker:str) -> ResponseObservation: ...

class ClaudeGuardedDriver:
    def __init__(self,binding:Binding,lease:BodyWriteLease,holder_id:str,surface:ClaudeBrowserSurface):
        self.binding=binding; self.lease=lease; self.holder_id=holder_id; self.surface=surface; self._marker=None
    def _guard(self):
        url,logged,composer=self.surface.page_state()
        validate_claude_page(self.binding,current_url=url,logged_in=logged,composer_visible=composer)
        verify_write_lease(self.lease,session_key=self.binding.browser_space_id,holder_id=self.holder_id,revision=self.binding.lease_revision)
        return url,logged,composer
    def observe(self,binding):
        if binding!=self.binding: raise GuardViolation("Claude driver binding changed")
        url,logged,_=self._guard()
        return BrowserObservation(url,self.surface.head_fingerprint(),self.binding.lease_revision,logged,self.surface.draft_empty(),self.surface.generation_idle())
    def compose_and_verify(self,binding,payload,payload_digest):
        if binding!=self.binding: raise GuardViolation("Claude driver binding changed")
        self._guard(); self.surface.compose_exact(payload,payload_digest)
    def click_send_once(self,binding):
        if binding!=self.binding: raise GuardViolation("Claude driver binding changed")
        self._guard()
        if not self._marker: raise GuardViolation("operation marker not bound")
        return self.surface.send_once_evidence(self._marker)
    def observe_response_read_only(self,binding,marker):
        if binding!=self.binding: raise GuardViolation("Claude driver binding changed")
        self._guard()
        return self.surface.response_evidence(marker)
    def send_operation(self,op:Operation,payload:str):
        self._marker=op.marker
        return send_once(op,payload,self)
    def capture_operation(self,op:Operation):
        return capture_read_only(op,self)
