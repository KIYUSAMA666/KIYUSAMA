"""Write-lease/fencing contract for an external consumer-chat body.

World source: OpenCLI persistent site-session arbitration. One logical writer
owns a session; another writer fails closed. Unknown transport outcome never
grants a second Send. Read-only reconciliation remains legal.

This is pure domain logic. It does not own browser credentials or perform I/O.
"""
from dataclasses import dataclass, replace
from external_body_adapter import GuardViolation

@dataclass(frozen=True)
class BodyWriteLease:
    session_key: str
    holder_id: str
    revision: int
    active: bool = True

def acquire_write_lease(*, session_key: str, holder_id: str, revision: int) -> BodyWriteLease:
    if not session_key or not holder_id or revision < 1:
        raise GuardViolation("invalid external-body write lease identity")
    return BodyWriteLease(session_key, holder_id, revision, True)

def verify_write_lease(lease: BodyWriteLease, *, session_key: str, holder_id: str, revision: int) -> None:
    if not lease.active:
        raise GuardViolation("external-body write lease is inactive")
    if session_key != lease.session_key:
        raise GuardViolation("external-body session lease mismatch")
    if holder_id != lease.holder_id:
        raise GuardViolation("external-body session busy")
    if revision != lease.revision:
        raise GuardViolation("external-body fencing revision changed")

def release_write_lease(lease: BodyWriteLease, *, holder_id: str) -> BodyWriteLease:
    if holder_id != lease.holder_id:
        raise GuardViolation("non-holder cannot release external-body lease")
    return replace(lease, active=False)

def transport_retry_identity(*, original_command_id: str, retry_command_id: str, outcome_known_absent: bool) -> str:
    if not original_command_id:
        raise GuardViolation("stable command identity required")
    if retry_command_id != original_command_id:
        raise GuardViolation("transport retry must reuse exact command identity")
    if not outcome_known_absent:
        return "RECONCILE_READ_ONLY"
    return "RETRY_SAME_COMMAND_ID"
