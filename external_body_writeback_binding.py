"""Bind a verified external-body capture to the existing OPEN ROOM write-back lane.

This is the narrow adapter between the browser-side durable receipt and the
already-existing idempotent OPEN ROOM writer. It grants no Send authority.
"""
from dataclasses import dataclass
from hashlib import sha256
from external_body_adapter import Operation, State, GuardViolation

@dataclass(frozen=True)
class CapturedResponseReceipt:
    workflow_id: str
    operation_id: str
    event_id: str
    canonical_url: str
    turn_marker: str
    prompt_message_id: str
    response_message_id: str
    response_digest: str
    response_text: str

@dataclass(frozen=True)
class OpenRoomWriteBackIntent:
    operation_key: str
    parent_subject_key: str
    external_workflow_id: str
    external_operation_id: str
    external_event_id: str
    canonical_url: str
    turn_marker: str
    response_message_id: str
    response_digest: str
    response_text: str

def _sha256_text(value: str) -> str:
    return "sha256:" + sha256(value.encode("utf-8")).hexdigest()

def bind_capture_to_writeback(op: Operation, receipt: CapturedResponseReceipt, *, parent_subject_key: str) -> OpenRoomWriteBackIntent:
    if op.state is not State.CAPTURED:
        raise GuardViolation("OPEN ROOM write-back requires CAPTURED external response")
    if not parent_subject_key.strip():
        raise GuardViolation("parent OPEN ROOM subject_key required")
    if receipt.event_id != op.event_id or receipt.operation_id != op.marker:
        raise GuardViolation("external capture operation identity mismatch")
    if receipt.canonical_url != op.binding.canonical_url or receipt.turn_marker != op.marker:
        raise GuardViolation("external capture conversation/turn mismatch")
    if not receipt.workflow_id.strip() or not receipt.prompt_message_id.strip() or not receipt.response_message_id.strip():
        raise GuardViolation("external capture receipt identity incomplete")
    if receipt.prompt_message_id == receipt.response_message_id:
        raise GuardViolation("prompt/response identity collision")
    if receipt.response_digest != _sha256_text(receipt.response_text):
        raise GuardViolation("external capture digest mismatch")
    operation_key = "external-body-writeback:" + sha256(
        f"{parent_subject_key}\n{receipt.workflow_id}\n{receipt.operation_id}\n{receipt.response_message_id}\n{receipt.response_digest}".encode("utf-8")
    ).hexdigest()
    return OpenRoomWriteBackIntent(
        operation_key=operation_key,
        parent_subject_key=parent_subject_key,
        external_workflow_id=receipt.workflow_id,
        external_operation_id=receipt.operation_id,
        external_event_id=receipt.event_id,
        canonical_url=receipt.canonical_url,
        turn_marker=receipt.turn_marker,
        response_message_id=receipt.response_message_id,
        response_digest=receipt.response_digest,
        response_text=receipt.response_text,
    )
