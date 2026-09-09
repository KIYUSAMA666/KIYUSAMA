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

export function selectCurrentSnapshot(a: CurrentStateSnapshot, b: CurrentStateSnapshot): SnapshotSelection {
  if (a.identity.scope !== b.identity.scope) return { status: "STATE_CONFLICT", reason: "scope mismatch" };
  if (a.identity.lineageId !== b.identity.lineageId) {
    return { status: "LINEAGE_CONFLICT", reason: "automatic lineage selection forbidden" };
  }
  if (a.identity.stateRevision === b.identity.stateRevision) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
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
