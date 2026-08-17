"""Fail-closed Managed KIRA dispatch through the external permission gate.

The lane intentionally contains one executable capability: reviewing a COMMON
MEMORY record.  MANAGED_WAKE authentication, gate access, execution and audit
storage are supplied by the existing control-plane adapters.  This module does
not handle their credentials and grants no permissions.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Callable, Mapping, Protocol
from uuid import uuid4

ACTOR = "KIRA_MANAGED"
CODEX_K_PR_REQUIRED = "CODEX_K_PR_REQUIRED"

# This is the complete Managed KIRA tool registry for the first proof.
_TOOLS = MappingProxyType(
    {
        "common_memory.review": {
            "declared_scope": "COMMON_MEMORY_AUDIT",
            "action_kind": "READ_REVIEW",
            "target_class": "COMMON_MEMORY_RECORD",
        }
    }
)

# Non-executable request classes exist only so the external gate receives an
# honest classification and can deterministically ROUTE/DENY them.  They are
# deliberately absent from _TOOLS and can never reach an executor.
_NON_EXECUTABLE = MappingProxyType(
    {
        "code.change": ("REPOSITORY", "CODE_CHANGE", "SOURCE_CODE"),
        "secret.read": ("SECRETS", "SECRET_ACCESS", "SECRET"),
        "main.change": ("REPOSITORY", "MAIN_CHANGE", "PROTECTED_BRANCH"),
        "publish": ("RELEASE", "PUBLISH", "PUBLIC_ARTIFACT"),
        "billing.change": ("BILLING", "BILLING_CHANGE", "BILLING_ACCOUNT"),
        "SAFE_COLLAB.publish": ("RELEASE", "PUBLISH", "PUBLIC_ARTIFACT"),
    }
)


@dataclass(frozen=True)
class ToolRequest:
    request_id: str
    tool: str
    target: str
    managed_wake: Mapping[str, Any]
    asserted_actor: str = ACTOR


@dataclass(frozen=True)
class GateDecision:
    decision: str
    decision_id: str
    evidence: Mapping[str, Any]


class AuditSink(Protocol):
    """The production adapter must append; it must never update or delete."""

    def get(self, request_id: str) -> Mapping[str, Any] | None: ...

    def append(self, record: Mapping[str, Any]) -> None: ...


class PermissionGate(Protocol):
    """Adapter for public.kira_permission_gate_v1."""

    def evaluate(
        self, *, actor: str, declared_scope: str, action_kind: str, target_class: str
    ) -> Mapping[str, Any]: ...


class ManagedKiraLane:
    """Authenticated, idempotent, gate-before-execute Managed KIRA lane."""

    def __init__(
        self,
        *,
        verify_managed_wake: Callable[[Mapping[str, Any]], bool],
        gate: PermissionGate,
        audit: AuditSink,
        read_review: Callable[[str], Any],
    ) -> None:
        self.__verify_wake = verify_managed_wake
        self.__gate = gate
        self.__audit = audit
        self.__read_review = read_review

    @staticmethod
    def tools() -> tuple[str, ...]:
        return tuple(_TOOLS)

    def dispatch(self, request: ToolRequest) -> Mapping[str, Any]:
        prior = self.__audit.get(request.request_id)
        if prior is not None:
            return dict(prior["response"])

        envelope = self.__classify(request)
        if envelope is None:
            return self.__finish(
                request,
                GateDecision("DENY", self.__local_id(), {"reason": "UNCLASSIFIED"}),
                "HUMAN_BLOCKED",
            )

        try:
            wake_ok = self.__verify_wake(request.managed_wake)
        except Exception:
            wake_ok = False
        if not wake_ok:
            return self.__finish(
                request,
                GateDecision("DENY", self.__local_id(), {"reason": "MANAGED_WAKE_INVALID"}),
                "HUMAN_BLOCKED",
                envelope,
            )

        # All four fields are server-derived. Caller labels cannot weaken them.
        try:
            raw = self.__gate.evaluate(**envelope)
            decision = self.__parse_gate(raw)
        except Exception:
            decision = GateDecision(
                "DENY", self.__local_id(), {"reason": "PERMISSION_GATE_UNAVAILABLE_OR_MALFORMED"}
            )

        if request.asserted_actor != ACTOR:
            decision = GateDecision(
                "DENY",
                decision.decision_id,
                {**dict(decision.evidence), "reason": "WRONG_ACTOR"},
            )

        if decision.decision == "ROUTE":
            return self.__finish(request, decision, CODEX_K_PR_REQUIRED, envelope)
        if decision.decision != "ALLOW":
            return self.__finish(request, decision, "HUMAN_BLOCKED", envelope)

        # ALLOW is insufficient unless it is for the sole exact capability.
        if request.tool != "common_memory.review" or envelope != _TOOLS[request.tool] | {"actor": ACTOR}:
            denied = GateDecision(
                "DENY", decision.decision_id, {**dict(decision.evidence), "reason": "ALLOW_SCOPE_MISMATCH"}
            )
            return self.__finish(request, denied, "HUMAN_BLOCKED", envelope)

        try:
            result = self.__read_review(request.target)
        except Exception:
            failed = GateDecision(
                "DENY",
                decision.decision_id,
                {**dict(decision.evidence), "reason": "READ_EXECUTION_FAILED"},
            )
            return self.__finish(request, failed, "HUMAN_BLOCKED", envelope)
        return self.__finish(request, decision, "EXECUTED", envelope, result)

    @staticmethod
    def __classify(request: ToolRequest) -> dict[str, str] | None:
        spec = _TOOLS.get(request.tool)
        if not request.request_id or not request.target:
            return None
        if spec is not None:
            return {"actor": ACTOR, **spec}
        blocked = _NON_EXECUTABLE.get(request.tool)
        if blocked is None:
            return None
        scope, action, target_class = blocked
        return {
            "actor": ACTOR,
            "declared_scope": scope,
            "action_kind": action,
            "target_class": target_class,
        }

    @staticmethod
    def __parse_gate(raw: Mapping[str, Any]) -> GateDecision:
        decision = raw.get("decision")
        decision_id = raw.get("decision_id")
        evidence = raw.get("evidence")
        if decision not in {"ALLOW", "ROUTE", "DENY"}:
            raise ValueError("unknown gate decision")
        if not isinstance(decision_id, str) or not decision_id:
            raise ValueError("missing decision_id")
        if not isinstance(evidence, Mapping):
            raise ValueError("missing evidence")
        return GateDecision(decision, decision_id, dict(evidence))

    @staticmethod
    def __local_id() -> str:
        return f"fail-closed-{uuid4()}"

    def __finish(
        self,
        request: ToolRequest,
        decision: GateDecision,
        status: str,
        envelope: Mapping[str, str] | None = None,
        result: Any = None,
    ) -> Mapping[str, Any]:
        response = {
            "request_id": request.request_id,
            "status": status,
            "decision": decision.decision,
            "decision_id": decision.decision_id,
            "evidence": dict(decision.evidence),
        }
        if status == "EXECUTED":
            response["result"] = result
        # Append happens before the response is released, including failures.
        self.__audit.append(
            {
                "request_id": request.request_id,
                "actor": ACTOR,
                "envelope": dict(envelope or {}),
                "decision_id": decision.decision_id,
                "evidence": dict(decision.evidence),
                "response": dict(response),
            }
        )
        return response
