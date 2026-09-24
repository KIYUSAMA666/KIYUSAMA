"""KIRA's gated COMMON MEMORY audit lane.

This module deliberately owns no credentials and performs no wake claiming.  The
caller must inject the existing durable Managed Wake verifier, a read-only
COMMON MEMORY reader, and (when code routing is enabled) the existing CODEX-K
COMMON MEMORY task enqueue operation.
"""

from dataclasses import dataclass
from enum import Enum
import json
from typing import Any, Callable, Mapping


GATE_SQL = (
    "SELECT public.kira_permission_gate_v1("
    "%s, %s, %s, %s, %s) AS result"
)


class GateContractError(RuntimeError):
    """The production gate returned a value outside its declared contract."""


class PermissionDenied(RuntimeError):
    """The gate did not authorize the sole local executor."""


@dataclass(frozen=True)
class GateDecision:
    ok: bool
    decision_id: int
    decision: str
    route: str
    reason: str


class SecurityIntent(Enum):
    """Non-executable probes used to audit fail-closed production behavior."""

    CODE_ROUTE = ("CODE_EDIT", "REPOSITORY")
    SECRET_DENY = ("SECRET_READ", "SECRET")
    MAIN_DENY = ("MAIN_DIRECT_WRITE", "MAIN")
    PUBLISH_DENY = ("EXTERNAL_PUBLISH", "PUBLIC_EXTERNAL")
    BILLING_DENY = ("BILLING_CHANGE", "BILLING")
    UNKNOWN_DENY = ("UNKNOWN", "UNKNOWN")


def _parse_gate_result(raw: Any) -> GateDecision:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise GateContractError("gate result is not valid JSON") from exc
    if not isinstance(raw, Mapping):
        raise GateContractError("gate result must be a JSON object")

    required = {"ok", "decision_id", "decision", "route", "reason"}
    if set(raw) != required:
        raise GateContractError("gate result has unexpected fields")
    if type(raw["ok"]) is not bool:
        raise GateContractError("gate ok must be boolean")
    decision_id = raw["decision_id"]
    if type(decision_id) is not int or not -(2**63) <= decision_id < 2**63:
        raise GateContractError("gate decision_id must be a PostgreSQL bigint")
    if any(type(raw[key]) is not str for key in ("decision", "route", "reason")):
        raise GateContractError("gate decision, route, and reason must be strings")
    if raw["decision"] not in {"ALLOW", "ROUTE", "DENY"}:
        raise GateContractError("unknown gate decision")

    return GateDecision(
        ok=raw["ok"],
        decision_id=decision_id,
        decision=raw["decision"],
        route=raw["route"],
        reason=raw["reason"],
    )


class PostgresPermissionGate:
    """Calls the live gate through an injected DB-API connection."""

    def __init__(self, connection: Any):
        self._connection = connection

    def evaluate(
        self,
        message_id: Any,
        actor: str,
        declared_scope: str,
        action_kind: str,
        target_class: str,
    ) -> GateDecision:
        with self._connection.cursor() as cursor:
            cursor.execute(
                GATE_SQL,
                (message_id, actor, declared_scope, action_kind, target_class),
            )
            row = cursor.fetchone()
        if row is None or len(row) != 1:
            raise GateContractError("gate query must return exactly one value")
        return _parse_gate_result(row[0])


class KiraCommonMemoryLane:
    """One local read tool plus a narrowly gated CODEX-K task handoff."""

    _ACTOR = "KIRA_MANAGED"

    def __init__(
        self,
        gate: PostgresPermissionGate,
        verify_managed_wake: Callable[[Any, Any], str],
        common_memory_reader: Callable[[Any], Any],
        enqueue_codex_k_task: Callable[[str, str, str], Any] | None = None,
    ):
        self._gate = gate
        self._verify_managed_wake = verify_managed_wake
        self._common_memory_reader = common_memory_reader
        self._enqueue_codex_k_task = enqueue_codex_k_task

    def read_common_memory(self, message_id: Any, wake_claim: Any) -> Any:
        """The lane's sole locally executable tool."""
        scope = self._verify_managed_wake(message_id, wake_claim)
        if scope not in {"REVIEW_ONLY", "MANAGED_WAKE"}:
            raise PermissionDenied("Managed Wake verification did not grant read scope")

        decision = self._gate.evaluate(
            message_id,
            self._ACTOR,
            scope,
            "READ",
            "COMMON_MEMORY",
        )
        if decision != GateDecision(
            ok=True,
            decision_id=decision.decision_id,
            decision="ALLOW",
            route="DIRECT",
            reason="READ_REVIEW_ALLOWLIST",
        ):
            raise PermissionDenied("COMMON MEMORY read was not directly authorized")
        return self._common_memory_reader(message_id)

    def evaluate_security_intent(
        self, message_id: Any, intent: SecurityIntent
    ) -> GateDecision:
        """Evaluate a test intent at the gate; never dispatch a local executor."""
        if not isinstance(intent, SecurityIntent):
            raise TypeError("intent must be a server-defined SecurityIntent")
        action_kind, target_class = intent.value
        return self._gate.evaluate(
            message_id,
            self._ACTOR,
            "REVIEW_ONLY",
            action_kind,
            target_class,
        )

    def route_code_request(
        self, message_id: Any, wake_claim: Any, code_request: str
    ) -> Any:
        """Enqueue one existing-lane CODEX-K task; never execute code locally.

        The existing COMMON MEMORY contract makes ``subject_key`` plus version
        the durable idempotency boundary.  The injected operation owns that
        established insert/conflict behavior and supplies the contract's fixed
        TASK metadata; this lane supplies only its evidenced variable fields.
        """
        scope = self._verify_managed_wake(message_id, wake_claim)
        if scope != "MANAGED_WAKE":
            raise PermissionDenied(
                "Managed Wake verification did not grant code routing"
            )
        if type(code_request) is not str or not code_request.strip():
            raise PermissionDenied("code request must be non-empty text")

        decision = self._gate.evaluate(
            message_id,
            self._ACTOR,
            scope,
            "CODE_EDIT",
            "REPOSITORY",
        )
        if decision != GateDecision(
            ok=False,
            decision_id=decision.decision_id,
            decision="ROUTE",
            route="CODEX_K_PR_REQUIRED",
            reason="CODEX_K_PR_REQUIRED",
        ):
            raise PermissionDenied("code request was not routed to CODEX-K")
        if self._enqueue_codex_k_task is None:
            raise PermissionDenied(
                "existing CODEX-K task enqueue operation is unavailable"
            )

        # Both values use existing immutable knowledge_entries fields.  The
        # runner's result records already bind back through knowledge_entry_id.
        subject_key = f"codex.k.task.{message_id}"
        source_ref = f"kira.permission_gate.decision.{decision.decision_id}"
        return self._enqueue_codex_k_task(subject_key, code_request, source_ref)
