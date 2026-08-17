"""Fail-closed managed execution for the KIRA one-read-tool lane."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping, Protocol
from uuid import UUID

CODEX_K_PR_REQUIRED = "CODEX_K_PR_REQUIRED"
KIRA_ACTOR = "KIRA"
READ_TOOL = "common_memory_read_review"
READ_SCOPE = "COMMON_MEMORY"
READ_ACTION = "READ_REVIEW"
READ_TARGET = "COMMON_MEMORY_DB"


class InvalidRequest(ValueError):
    """The request is not an executable request for this lane."""


class GateUnavailable(RuntimeError):
    """The permission gate failed or returned an unusable response."""


class GateClient(Protocol):
    def permission_gate(
        self,
        message_id: UUID,
        actor: str,
        declared_scope: str,
        action_kind: str,
        target_class: str,
    ) -> Any: ...


class PermissionGateAdapter:
    """Adapter for the exact production PostgreSQL function signature."""

    SQL = "SELECT public.kira_permission_gate_v1(%s, %s, %s, %s, %s)"

    def __init__(self, connection: Any):
        self._connection = connection

    def permission_gate(
        self,
        message_id: UUID,
        actor: str,
        declared_scope: str,
        action_kind: str,
        target_class: str,
    ) -> Any:
        # Ordering is security-relevant: UUID, actor, scope, action, target.
        with self._connection.cursor() as cursor:
            cursor.execute(
                self.SQL,
                (message_id, actor, declared_scope, action_kind, target_class),
            )
            row = cursor.fetchone()
        if not row or len(row) != 1:
            raise GateUnavailable("permission gate returned no single result")
        return row[0]


@dataclass(frozen=True)
class KiraRequest:
    message_id: UUID
    actor: str
    declared_scope: str
    action_kind: str
    target_class: str
    tool: str
    arguments: Mapping[str, Any]
    managed_wake: str


@dataclass(frozen=True)
class GateEvidence:
    decision_id: int
    decision: str
    route: str
    reason: str


@dataclass(frozen=True)
class LaneResult:
    status: str
    evidence: GateEvidence
    output: Any = None


class ManagedKiraLane:
    """Exactly one executable tool, with a mandatory DB gate before execution."""

    def __init__(
        self,
        gate: GateClient,
        read_tool: Callable[[Mapping[str, Any]], Any],
        verify_managed_wake: Callable[[str, UUID], bool],
    ):
        self._gate = gate
        self._read_tool = read_tool
        self._verify_wake = verify_managed_wake
        self._completed: dict[UUID, tuple[tuple[Any, ...], LaneResult]] = {}

    @staticmethod
    def executable_tools() -> tuple[str, ...]:
        return (READ_TOOL,)

    def execute(self, request: KiraRequest) -> LaneResult:
        fingerprint = self._validate(request)
        previous = self._completed.get(request.message_id)
        if previous is not None:
            if previous[0] != fingerprint:
                raise InvalidRequest("message_id was already used for another request")
            return previous[1]

        # There is deliberately no local execution path before this call.
        try:
            raw = self._gate.permission_gate(
                request.message_id,
                request.actor,
                request.declared_scope,
                request.action_kind,
                request.target_class,
            )
        except GateUnavailable:
            raise
        except Exception as exc:
            raise GateUnavailable("permission gate unavailable") from exc

        evidence = self._parse_gate(raw)
        if evidence.decision == "ALLOW":
            output = self._read_tool(request.arguments)
            result = LaneResult("EXECUTED", evidence, output)
        elif evidence.decision == "ROUTE":
            result = LaneResult(CODEX_K_PR_REQUIRED, evidence)
        else:  # DENY and HUMAN are valid, blocking decisions.
            result = LaneResult("BLOCKED", evidence)
        self._completed[request.message_id] = (fingerprint, result)
        return result

    def _validate(self, request: KiraRequest) -> tuple[Any, ...]:
        if not isinstance(request.message_id, UUID):
            raise InvalidRequest("message_id must be a request-correlated UUID")
        if request.actor != KIRA_ACTOR:
            raise InvalidRequest("wrong actor")
        expected = (READ_SCOPE, READ_ACTION, READ_TARGET, READ_TOOL)
        actual = (
            request.declared_scope,
            request.action_kind,
            request.target_class,
            request.tool,
        )
        if actual != expected:
            raise InvalidRequest("request is not the exact READ/REVIEW operation")
        if not self._verify_wake(request.managed_wake, request.message_id):
            raise InvalidRequest("MANAGED_WAKE verification failed")
        if not isinstance(request.arguments, Mapping):
            raise InvalidRequest("tool arguments must be a mapping")
        # A stable, non-secret representation is used only for in-process replay checks.
        return (*actual, request.actor, repr(sorted(request.arguments.items())))

    @staticmethod
    def _parse_gate(raw: Any) -> GateEvidence:
        if not isinstance(raw, Mapping):
            raise GateUnavailable("malformed permission gate response")
        required = {"ok", "decision_id", "decision", "route", "reason"}
        if set(raw) != required or raw["ok"] is not True:
            raise GateUnavailable("malformed permission gate response")
        decision_id = raw["decision_id"]
        if isinstance(decision_id, bool) or not isinstance(decision_id, int):
            raise GateUnavailable("invalid permission gate decision_id")
        decision = raw["decision"]
        route, reason = raw["route"], raw["reason"]
        if decision not in {"ALLOW", "ROUTE", "DENY", "HUMAN"}:
            raise GateUnavailable("invalid permission gate decision")
        if not isinstance(route, str) or not isinstance(reason, str):
            raise GateUnavailable("invalid permission gate evidence")
        # Frozen fields preserve the production route and reason verbatim.
        return GateEvidence(decision_id, decision, route, reason)
