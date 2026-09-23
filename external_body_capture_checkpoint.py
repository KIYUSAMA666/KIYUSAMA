"""Durable capture checkpoint policy copied from the locked world-success pattern.

A confirmed/ambiguous Send is never converted back into Send authority.
Pending capture persists evidence needed to resume read-only observation after restart.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from external_body_adapter import Operation, State, GuardViolation

@dataclass(frozen=True)
class CaptureCheckpoint:
    event_id: str
    canonical_url: str
    prior_head: str
    marker: str
    state: State
    observed_at: str
    generation_running: bool
    reason: str

def make_capture_checkpoint(op: Operation, *, generation_running: bool, reason: str, observed_at: str | None = None) -> CaptureCheckpoint:
    if op.state not in (State.SEND_CONFIRMED, State.RECONCILE):
        raise GuardViolation("capture checkpoint requires delivery evidence")
    if reason not in ("generation_running", "response_not_terminal"):
        raise GuardViolation("unsupported pending-capture reason")
    return CaptureCheckpoint(
        event_id=op.event_id,
        canonical_url=op.binding.canonical_url,
        prior_head=op.binding.observed_head,
        marker=op.marker,
        state=op.state,
        observed_at=observed_at or datetime.now(timezone.utc).isoformat(),
        generation_running=generation_running,
        reason=reason,
    )

def validate_resume(op: Operation, checkpoint: CaptureCheckpoint) -> None:
    if op.state not in (State.SEND_CONFIRMED, State.RECONCILE):
        raise GuardViolation("resume requires delivery evidence")
    if checkpoint.state != op.state:
        raise GuardViolation("capture state changed")
    if checkpoint.event_id != op.event_id or checkpoint.marker != op.marker:
        raise GuardViolation("capture operation identity mismatch")
    if checkpoint.canonical_url != op.binding.canonical_url:
        raise GuardViolation("capture conversation mismatch")
    if checkpoint.prior_head != op.binding.observed_head:
        raise GuardViolation("capture prior-head mismatch")

def capture_wait_policy(checkpoint: CaptureCheckpoint, now_ms: int) -> tuple[int, bool]:
    if checkpoint.reason != "response_not_terminal" or checkpoint.generation_running:
        return 250, False
    started_ms = int(datetime.fromisoformat(checkpoint.observed_at).timestamp() * 1000)
    inactive = max(0, now_ms - started_ms)
    delay = 30000 if inactive >= 5*60_000 else 15000 if inactive >= 60_000 else 5000 if inactive >= 10_000 else 2000
    return delay, inactive >= 30*60_000
