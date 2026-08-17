"""DB-API adapter for the external deterministic PostgreSQL gate."""

from __future__ import annotations

import json
from typing import Any, Mapping


class PostgresPermissionGate:
    """Calls the gate by its fully-qualified name; it has no fallback."""

    SQL = "select public.kira_permission_gate_v1(%s, %s, %s, %s)"

    def __init__(self, connection: Any) -> None:
        self._connection = connection

    def evaluate(
        self, *, actor: str, declared_scope: str, action_kind: str, target_class: str
    ) -> Mapping[str, Any]:
        with self._connection.cursor() as cursor:
            cursor.execute(self.SQL, (actor, declared_scope, action_kind, target_class))
            row = cursor.fetchone()
        if row is None or len(row) != 1:
            raise ValueError("permission gate returned no single result")
        value = row[0]
        if isinstance(value, str):
            value = json.loads(value)
        if not isinstance(value, Mapping):
            raise ValueError("permission gate result is not an object")
        return value
