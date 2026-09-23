from dataclasses import dataclass
from typing import Protocol
from external_body_adapter import Binding, Operation, State, GuardViolation, verify_before_send, confirm_send, mark_ambiguous_send, capture_response, require_human

@dataclass(frozen=True)
class BrowserObservation:
    canonical_url: str
    head_fingerprint: str
    lease_revision: int
    authenticated: bool
    draft_empty: bool
    generation_idle: bool

@dataclass(frozen=True)
class SendEvidence:
    confirmed: bool

@dataclass(frozen=True)
class ResponseObservation:
    prior_head: str
    new_head: str
    marker_observed: bool
    stable: bool

class BrowserDriver(Protocol):
    def observe(self, binding: Binding) -> BrowserObservation: ...
    def compose_and_verify(self, binding: Binding, payload: str, payload_digest: str) -> None: ...
    def click_send_once(self, binding: Binding) -> SendEvidence: ...
    def observe_response_read_only(self, binding: Binding, marker: str) -> ResponseObservation: ...

def send_once(op: Operation, payload: str, driver: BrowserDriver) -> Operation:
    obs = driver.observe(op.binding)
    if not obs.authenticated:
        return require_human(op)
    if not obs.draft_empty or not obs.generation_idle:
        raise GuardViolation("browser not ready")
    verify_before_send(op, canonical_url=obs.canonical_url, observed_head=obs.head_fingerprint, lease_revision=obs.lease_revision)
    driver.compose_and_verify(op.binding, payload, op.payload_digest)
    evidence = driver.click_send_once(op.binding)
    return confirm_send(op) if evidence.confirmed else mark_ambiguous_send(op)

def capture_read_only(op: Operation, driver: BrowserDriver) -> Operation:
    if op.state not in (State.SEND_CONFIRMED, State.RECONCILE):
        raise GuardViolation("read-only capture requires delivery evidence")
    r = driver.observe_response_read_only(op.binding, op.marker)
    if not r.stable:
        return op
    return capture_response(op, prior_head=r.prior_head, new_head=r.new_head, marker_observed=r.marker_observed)
