export type RefStatus = "VERIFIED" | "UNVERIFIED_REF";
export type LaneStatus = "VERIFIED" | "UNVERIFIED" | "HOLD" | "FAIL";
export type EvidenceVerdict = "SUFFICIENT" | "INSUFFICIENT" | "CONFLICT";

export interface CurrentStateSnapshot {
  identity: {
    stateId: string;
    schemaVersion: string;
    stateRevision: number;
    effectiveAt: string;
    scope: "KIYUSAMA_OS_2";
    lineageId: string;
  };
  humanDecisionFinal: {
    decisionId: string;
    sourceAuthority: "KIYUSAMA";
    shortDirective: string;
  };
  mainLineTask: { taskId: string; description: string };
  nextActionSingle: { actionId: string; description: string };
  activeRolesAndAuthority: Readonly<Record<string, string>>;
  activeGuards: ReadonlyArray<{ guardId: string; rule: string; refConfirmed: RefStatus }>;
  confirmedRefIndex: ReadonlyArray<{
    id: string;
    status: RefStatus;
    expectedVersion: string | null;
    path: string | null;
  }>;
  independentLaneHealth: {
    status: LaneStatus;
    evidenceVerdict: EvidenceVerdict;
    observedAt: string | null;
    evidenceSource: string;
  };
}

export type SnapshotSelection =
  | { status: "SELECTED"; snapshot: CurrentStateSnapshot }
  | { status: "STATE_CONFLICT"; reason: string }
  | { status: "LINEAGE_CONFLICT"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

function exactJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalJson(a)) === JSON.stringify(canonicalJson(b));
}

export function selectCurrentSnapshot(a: CurrentStateSnapshot, b: CurrentStateSnapshot): SnapshotSelection {
  if (a.identity.scope !== b.identity.scope) return { status: "STATE_CONFLICT", reason: "scope mismatch" };
  if (a.identity.lineageId !== b.identity.lineageId) {
    return { status: "LINEAGE_CONFLICT", reason: "automatic lineage selection forbidden" };
  }
  if (a.identity.stateRevision === b.identity.stateRevision) {
    // Durable JSON stores such as PostgreSQL jsonb may reorder object keys.
    // Treat object-key order as non-semantic while preserving array order and all values.
    if (!exactJsonEqual(a, b)) {
      return { status: "STATE_CONFLICT", reason: "same revision with different payload" };
    }
    return { status: "SELECTED", snapshot: a };
  }
  return { status: "SELECTED", snapshot: a.identity.stateRevision > b.identity.stateRevision ? a : b };
}

export function assertSnapshotInvariant(snapshot: CurrentStateSnapshot): void {
  if (!snapshot.identity.stateId.trim()) throw new Error("stateId is required");
  if (!snapshot.identity.schemaVersion.trim()) throw new Error("schemaVersion is required");
  if (!Number.isInteger(snapshot.identity.stateRevision) || snapshot.identity.stateRevision < 1) {
    throw new Error("stateRevision must be a positive integer");
  }
  if (snapshot.humanDecisionFinal.sourceAuthority !== "KIYUSAMA") throw new Error("FINAL AUTHORITY must be KIYUSAMA");
  if (!snapshot.nextActionSingle.actionId.trim()) throw new Error("single next action is required");
}
