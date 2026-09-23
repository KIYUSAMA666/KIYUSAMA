"""Identity-bound wiring to existing guarded KIYUSAMA OS capabilities.

This module is only a dispatcher.  It owns no credentials, does not implement
any capability, and does not replace the external/Managed Wake verifier.  The
composition root must inject the existing permission gate and guarded handlers.
"""

from dataclasses import dataclass
from enum import Enum
from types import MappingProxyType
from typing import Any, Callable, Mapping

from kira_audit_lane import GateDecision, PermissionDenied


class InternalIdentity(Enum):
    SORA = "SORA_INTERNAL"
    KIRA = "KIRA_MANAGED"


class Capability(Enum):
    REPOSITORY_INSPECT = ("READ", "REPOSITORY")
    SUPABASE_DB_INSPECT = ("READ", "SUPABASE_DB")
    SUPABASE_EDGE_INSPECT = ("READ", "SUPABASE_EDGE_FUNCTION")
    SUPABASE_LOG_INSPECT = ("READ", "SUPABASE_LOG")
    CODEX_S_IMPLEMENT = ("CODE_EDIT", "REPOSITORY")
    CODEX_K_VERIFY = ("CODE_VERIFY", "REPOSITORY")
    OPEN_ROOM_READ = ("READ", "OPEN_ROOM")
    OPEN_ROOM_WRITEBACK = ("WRITEBACK", "OPEN_ROOM")


_ALLOWLIST = MappingProxyType(
    {
        InternalIdentity.SORA: frozenset(
            capability
            for capability in Capability
            if capability is not Capability.CODEX_K_VERIFY
        ),
        InternalIdentity.KIRA: frozenset(
            capability
            for capability in Capability
            if capability is not Capability.CODEX_S_IMPLEMENT
        ),
    }
)


@dataclass(frozen=True)
class VerifiedInternalWake:
    identity: InternalIdentity
    scope: str


@dataclass(frozen=True)
class GuardedCapabilityBinding:
    """An existing guarded handler and the exact gate route that reaches it."""

    route: str
    handler: Callable[[Any, "DispatchAuditContext"], Any]


@dataclass(frozen=True)
class DispatchAuditContext:
    message_id: Any
    actor: str
    scope: str
    capability: str
    decision_id: int
    gate_route: str


class InternalTeamCapabilityLane:
    """Dispatch verified internal identities only through existing OS guards."""

    def __init__(
        self,
        gate: Any,
        verify_existing_wake: Callable[[Any, Any], VerifiedInternalWake],
        bindings: Mapping[Capability, GuardedCapabilityBinding],
    ):
        self._gate = gate
        self._verify_existing_wake = verify_existing_wake
        self._bindings = MappingProxyType(dict(bindings))

    def execute(
        self,
        message_id: Any,
        wake_claim: Any,
        capability: Capability,
        request: Any = None,
    ) -> Any:
        if not isinstance(capability, Capability):
            raise TypeError("capability must be a server-defined Capability")

        wake = self._verify_existing_wake(message_id, wake_claim)
        if not isinstance(wake, VerifiedInternalWake):
            raise PermissionDenied("existing wake verification did not bind an identity")
        if not isinstance(wake.identity, InternalIdentity):
            raise PermissionDenied("wake verification returned an unknown identity")
        if wake.scope not in {"MANAGED_WAKE", "INTERNAL_EXECUTION"}:
            raise PermissionDenied("wake verification did not grant internal execution")
        if capability not in _ALLOWLIST[wake.identity]:
            raise PermissionDenied("capability is not allowlisted for this identity")

        binding = self._bindings.get(capability)
        if binding is None:
            raise PermissionDenied("capability has no existing guarded binding")

        action_kind, target_class = capability.value
        decision = self._gate.evaluate(
            message_id,
            wake.identity.value,
            wake.scope,
            action_kind,
            target_class,
        )
        if not isinstance(decision, GateDecision):
            raise PermissionDenied("permission gate returned an invalid decision")
        if (
            not decision.ok
            or decision.decision not in {"ALLOW", "ROUTE"}
            or decision.route != binding.route
        ):
            raise PermissionDenied("permission gate did not authorize the bound route")

        audit = DispatchAuditContext(
            message_id=message_id,
            actor=wake.identity.value,
            scope=wake.scope,
            capability=capability.name,
            decision_id=decision.decision_id,
            gate_route=decision.route,
        )
        return binding.handler(request, audit)
