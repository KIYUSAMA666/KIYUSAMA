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
    canonical_url: str | None = None
    marker_count: int | None = None
    user_marker_count: int | None = None
    draft_marker_count: int | None = None

@dataclass(frozen=True)
class ResponseObservation:
    prior_head: str
    new_head: str
    marker_observed: bool
    stable: bool
    canonical_url: str | None = None
    committed_count: int | None = None
    prompt_role: str | None = None
    response_role: str | None = None
    prompt_marker_count: int | None = None
    rendered_marker_count: int | None = None
    prompt_message_id: str | None = None
    response_message_id: str | None = None

class BrowserDriver(Protocol):
    def observe(self, binding: Binding) -> BrowserObservation: ...
    def compose_and_verify(self, binding: Binding, payload: str, payload_digest: str) -> None: ...
    def click_send_once(self, binding: Binding) -> SendEvidence: ...
    def observe_response_read_only(self, binding: Binding, marker: str) -> ResponseObservation: ...

def _send_is_exact(op: Operation, evidence: SendEvidence) -> bool:
    return (
        evidence.confirmed
        and evidence.canonical_url == op.binding.canonical_url
        and evidence.marker_count == 1
        and evidence.user_marker_count == 1
        and evidence.draft_marker_count == 0
    )

def _response_is_exact(op: Operation, r: ResponseObservation) -> bool:
    return (
        r.stable
        and r.canonical_url == op.binding.canonical_url
        and r.committed_count == 2
        and r.prompt_role == "user"
        and r.response_role == "assistant"
        and r.prompt_marker_count == 1
        and r.rendered_marker_count == 1
        and bool(r.prompt_message_id)
        and bool(r.response_message_id)
        and r.prompt_message_id != r.response_message_id
    )

def send_once(op: Operation, payload: str, driver: BrowserDriver) -> Operation:
    obs = driver.observe(op.binding)
    if not obs.authenticated:
        return require_human(op)
    if not obs.draft_empty or not obs.generation_idle:
        raise GuardViolation("browser not ready")
    verify_before_send(op, canonical_url=obs.canonical_url, observed_head=obs.head_fingerprint, lease_revision=obs.lease_revision)
    driver.compose_and_verify(op.binding, payload, op.payload_digest)
    evidence = driver.click_send_once(op.binding)
    return confirm_send(op) if _send_is_exact(op, evidence) else mark_ambiguous_send(op)

def capture_read_only(op: Operation, driver: BrowserDriver) -> Operation:
    if op.state not in (State.SEND_CONFIRMED, State.RECONCILE):
        raise GuardViolation("read-only capture requires delivery evidence")
    r = driver.observe_response_read_only(op.binding, op.marker)
    if not r.stable:
        return op
    if not _response_is_exact(op, r):
        raise GuardViolation("response attribution mismatch")
    return capture_response(op, prior_head=r.prior_head, new_head=r.new_head, marker_observed=r.marker_observed)
