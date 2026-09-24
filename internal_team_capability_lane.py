"""Minimal KIRA_MANAGED to existing CODEX-K runtime binding.

The CODEX-K runner is injected by the production composition root.  This
module owns no credentials, worker claim, executor, or repository transport.
"""

from dataclasses import dataclass
from typing import Any, Callable, Mapping

from kira_audit_lane import GateDecision, PermissionDenied, PostgresPermissionGate


CODEX_K_ROUTE = "CODEX_K_PR_REQUIRED"
KIRA_MANAGED_ACTOR = "KIRA_MANAGED"


@dataclass(frozen=True)
class CodexKCodeEdit:
    message_id: Any
    wake_claim: Any
    task_id: str
    branch: str
    change_summary: str
    human_approval: str
    write_mode: str = "BRANCH_PR_ONLY"
    contains_secret: bool = False
    destructive: bool = False
    permission_change: bool = False


@dataclass(frozen=True)
class CodexKLineage:
    decision_id: int
    task_id: str
    run_id: str
    branch: str
    result_id: str


class CodexKDispatchError(PermissionDenied):
    """The request or runner result failed its exact binding contract."""


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _validate_request(request: CodexKCodeEdit) -> None:
    if not all(
        _nonempty(value)
        for value in (request.task_id, request.branch, request.change_summary)
    ):
        raise CodexKDispatchError("CODEX-K task binding is incomplete")
    if request.human_approval != "KIYUSAMA_APPROVED":
        raise CodexKDispatchError("KIYUSAMA approval is required")
    if request.write_mode != "BRANCH_PR_ONLY":
        raise CodexKDispatchError("only branch/PR writes are permitted")
    if request.branch.strip().lower() in {"main", "master", "refs/heads/main", "refs/heads/master"}:
        raise CodexKDispatchError("direct-main writes are forbidden")
    if request.contains_secret:
        raise CodexKDispatchError("secret-bearing tasks are forbidden")
    if request.destructive or request.permission_change:
        raise CodexKDispatchError("destructive or permission-changing tasks are forbidden")


def _parse_lineage(raw: Any, request: CodexKCodeEdit, decision_id: int) -> CodexKLineage:
    if not isinstance(raw, Mapping) or set(raw) != {
        "task_id", "run_id", "branch", "result_id"
    }:
        raise CodexKDispatchError("CODEX-K result lineage is malformed")
    if raw["task_id"] != request.task_id or raw["branch"] != request.branch:
        raise CodexKDispatchError("CODEX-K result lineage does not match the task")
    if not _nonempty(raw["run_id"]) or not _nonempty(raw["result_id"]):
        raise CodexKDispatchError("CODEX-K result lineage is incomplete")
    return CodexKLineage(
        decision_id=decision_id,
        task_id=request.task_id,
        run_id=raw["run_id"],
        branch=request.branch,
        result_id=raw["result_id"],
    )


class InternalTeamCapabilityLane:
    """Authorize one branch-ready task and bind it to the existing runner."""

    def __init__(
        self,
        gate: PostgresPermissionGate,
        verify_managed_wake: Callable[[Any, Any], str],
        codex_k_runner: Callable[[Mapping[str, Any]], Mapping[str, Any]],
    ):
        self._gate = gate
        self._verify_managed_wake = verify_managed_wake
        self._codex_k_runner = codex_k_runner

    def dispatch_code_edit(self, request: CodexKCodeEdit) -> CodexKLineage:
        if not isinstance(request, CodexKCodeEdit):
            raise TypeError("request must be a server-defined CodexKCodeEdit")
        _validate_request(request)
        scope = self._verify_managed_wake(request.message_id, request.wake_claim)
        if scope != "MANAGED_WAKE":
            raise CodexKDispatchError("verified Managed Wake is required")

        decision = self._gate.evaluate(
            request.message_id,
            KIRA_MANAGED_ACTOR,
            scope,
            "CODE_EDIT",
            "REPOSITORY",
        )
        if decision != GateDecision(
            ok=False,
            decision_id=decision.decision_id,
            decision="ROUTE",
            route=CODEX_K_ROUTE,
            reason=CODEX_K_ROUTE,
        ):
            raise CodexKDispatchError("permission gate did not select the CODEX-K route")

        result = self._codex_k_runner(
            {
                "actor": KIRA_MANAGED_ACTOR,
                "route": CODEX_K_ROUTE,
                "decision_id": decision.decision_id,
                "task_id": request.task_id,
                "branch": request.branch,
                "change_summary": request.change_summary,
                "write_mode": request.write_mode,
                "human_approval": request.human_approval,
            }
        )
        return _parse_lineage(result, request, decision.decision_id)
