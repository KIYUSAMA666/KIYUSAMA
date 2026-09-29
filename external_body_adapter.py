"""Fail-closed state machine for the external consumer-chat body adapter.

Pure domain logic only. Browser/provider wiring comes later.
No secrets, cookies, browser profiles, or production side effects belong here.
"""
from dataclasses import dataclass, replace
from enum import Enum


class State(str, Enum):
    PREPARED = "PREPARED"
    SEND_CONFIRMED = "SEND_CONFIRMED"
    CAPTURED = "CAPTURED"
    RECONCILE = "RECONCILE"
    HUMAN_REQUIRED = "HUMAN_REQUIRED"
    FAILED = "FAILED"


@dataclass(frozen=True)
class Binding:
    provider: str
    conversation_id: str
    canonical_url: str
    browser_space_id: str
    observed_head: str
    lease_revision: int


@dataclass(frozen=True)
class Operation:
    event_id: str
    payload_digest: str
    marker: str
    binding: Binding
    state: State = State.PREPARED
    captured_head: str | None = None


class GuardViolation(RuntimeError):
    pass


def verify_before_send(op: Operation, *, canonical_url: str, observed_head: str,
                       lease_revision: int) -> None:
    """Require the exact bound conversation/head/lease immediately before Send."""
    b = op.binding
    if op.state is not State.PREPARED:
        raise GuardViolation("send is only legal from PREPARED")
    if canonical_url != b.canonical_url:
        raise GuardViolation("canonical conversation mismatch")
    if observed_head != b.observed_head:
        raise GuardViolation("conversation head changed")
    if lease_revision != b.lease_revision:
        raise GuardViolation("lease/fencing revision changed")


def confirm_send(op: Operation) -> Operation:
    """Durably persist this state before waiting for an assistant response."""
    if op.state is not State.PREPARED:
        raise GuardViolation("blind resend forbidden")
    return replace(op, state=State.SEND_CONFIRMED)


def mark_ambiguous_send(op: Operation) -> Operation:
    """After a possibly-fired Send, reconciliation is read-only: never resend."""
    if op.state is not State.PREPARED:
        raise GuardViolation("ambiguous transition requires PREPARED")
    return replace(op, state=State.RECONCILE)


def capture_response(op: Operation, *, prior_head: str, new_head: str,
                     marker_observed: bool) -> Operation:
    """Attribute response only to the exact bound prior head and operation."""
    if op.state not in (State.SEND_CONFIRMED, State.RECONCILE):
        raise GuardViolation("capture requires confirmed/ambiguous send")
    if prior_head != op.binding.observed_head:
        raise GuardViolation("response prior-head mismatch")
    if not marker_observed:
        raise GuardViolation("operation marker not observed")
    if not new_head or new_head == prior_head:
        raise GuardViolation("no stable new assistant head")
    return replace(op, state=State.CAPTURED, captured_head=new_head)


def require_human(op: Operation) -> Operation:
    """Login/CAPTCHA/authentication boundary: fail closed."""
    return replace(op, state=State.HUMAN_REQUIRED)
