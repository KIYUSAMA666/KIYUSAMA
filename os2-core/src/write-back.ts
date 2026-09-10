import type { CurrentStateSnapshot } from "./current-state.js";

/**
 * WRITE BACK v0.1 scope:
 * 1. Bind the new CURRENT to its exact parent state/revision.
 * 2. Bind the new CURRENT back to the accepted result/handoff that justified it.
 * 3. Carry explicit consumption keys so the same result/handoff cannot authorize a second write.
 * 4. Carry an expected-current compare target for storage-layer CAS.
 *
 * Trust Anchor / Provenance Verification is intentionally NOT solved here.
 * It remains a separate OPEN/HOLD pillar and must not be inferred from these bindings.
 */

export interface WriteBackParentBinding {
  parentStateId: string;
  parentRevision: number;
}

export interface WriteBackSourceBinding {
  sourceResultId: string;
  sourceHandoffId: string;
}

export interface WriteBackConsumptionBinding {
  resultConsumptionKey: string;
  handoffConsumptionKey: string;
}

export interface WriteBackCasExpectation {
  expectedCurrentStateId: string;
  expectedCurrentRevision: number;
}

export interface WriteBackProvenance {
  parent: WriteBackParentBinding;
  source: WriteBackSourceBinding;
}

/**
 * Candidate CURRENT produced by WRITE BACK.
 * The base CurrentStateSnapshot contract remains unchanged/locked;
 * WRITE BACK adds explicit ancestry/source provenance to the produced candidate.
 */
export type WriteBackCurrentStateCandidate = CurrentStateSnapshot & {
  writeBack: WriteBackProvenance;
};

export interface WriteBackRequest {
  writeBackId: string;
  parent: WriteBackParentBinding;
  source: WriteBackSourceBinding;
  consumption: WriteBackConsumptionBinding;
  cas: WriteBackCasExpectation;
  candidate: WriteBackCurrentStateCandidate;
}

export type WriteBackDecision =
  | { status: "READY"; request: WriteBackRequest }
  | {
      status: "HOLD";
      reason:
        | "INVALID_WRITE_BACK"
        | "PARENT_MISMATCH"
        | "SOURCE_BINDING_MISMATCH"
        | "REVISION_CONFLICT"
        | "RESULT_ALREADY_CONSUMED"
        | "HANDOFF_ALREADY_CONSUMED";
    };

/**
 * Storage contract required by WRITE BACK v0.1.
 * Implementations must make current-revision comparison, consumption claims,
 * and CURRENT replacement one atomic commit boundary (CAS-equivalent).
 */
export interface WriteBackAtomicCommit {
  expectedCurrent: WriteBackCasExpectation;
  consumeResultId: string;
  consumeHandoffId: string;
  nextCurrent: WriteBackCurrentStateCandidate;
}
