import type { CurrentStateSnapshot } from "./current-state.js";
import type { ExecutionResultEvidence } from "./execution-result-evidence.js";

/**
 * TRUST ANCHOR / PROVENANCE VERIFICATION v0.1
 * STEP1: contracts only.
 *
 * Responsibility of this pillar:
 * prove that labels such as VERIFIED / independent-lane sufficient / verifier identity
 * came from an authorized, externally anchored provenance process instead of trusting
 * those labels merely because they are present in a snapshot/result object.
 *
 * This file does NOT yet implement cryptographic verification, provider lookup,
 * key management, revocation checks, or Trust Root establishment. Until those
 * mechanisms are implemented and independently audited, this pillar remains OPEN/HOLD.
 */

export type TrustSubjectKind =
  | "EVIDENCE_REF"
  | "INDEPENDENT_LANE"
  | "VERIFIER_IDENTITY";

export type TrustAnchorStatus = "ACTIVE" | "REVOKED" | "HOLD";

/**
 * Registry entry describing which authority may attest a particular trust subject.
 * `anchorVersion` is explicit so rotation/replacement cannot silently reuse an old proof.
 */
export interface TrustAnchor {
  anchorId: string;
  anchorVersion: string;
  subjectKind: TrustSubjectKind;
  authorityId: string;
  status: TrustAnchorStatus;
  validFrom: string;
  validUntil: string | null;
}

/**
 * Canonical subject binding carried by an attestation.
 * Evidence refs bind their expected version/path; verifier and lane subjects bind an
 * explicit subjectId plus state lineage/revision so an attestation cannot float freely.
 */
export interface ProvenanceSubjectBinding {
  subjectKind: TrustSubjectKind;
  subjectId: string;
  subjectVersion: string | null;
  subjectPath: string | null;
  stateId: string;
  stateRevision: number;
  lineageId: string;
}

/**
 * Provider-neutral proof envelope. The proof is intentionally opaque to this contract;
 * the verification adapter for `proofType` must verify it against the referenced anchor.
 */
export interface ProvenanceAttestation {
  attestationId: string;
  anchorId: string;
  anchorVersion: string;
  issuerAuthorityId: string;
  subject: ProvenanceSubjectBinding;
  issuedAt: string;
  expiresAt: string | null;
  proofType: string;
  proofValue: string;
}

export interface TrustAnchorRegistrySnapshot {
  registryId: string;
  registryRevision: number;
  anchors: ReadonlyArray<TrustAnchor>;
}

export interface ProvenanceVerificationInput {
  current: CurrentStateSnapshot;
  result: ExecutionResultEvidence | null;
  registry: TrustAnchorRegistrySnapshot;
  attestations: ReadonlyArray<ProvenanceAttestation>;
  now: string;
}

export type ProvenanceVerificationHoldReason =
  | "INVALID_PROVENANCE_INPUT"
  | "ANCHOR_NOT_FOUND"
  | "ANCHOR_NOT_ACTIVE"
  | "ANCHOR_VERSION_MISMATCH"
  | "AUTHORITY_MISMATCH"
  | "SUBJECT_BINDING_MISMATCH"
  | "ATTESTATION_EXPIRED"
  | "ATTESTATION_NOT_YET_VALID"
  | "PROOF_UNSUPPORTED"
  | "PROOF_INVALID"
  | "REQUIRED_ATTESTATION_MISSING";

export interface VerifiedProvenanceRef {
  subjectKind: TrustSubjectKind;
  subjectId: string;
  attestationId: string;
  anchorId: string;
  anchorVersion: string;
}

export type ProvenanceVerificationDecision =
  | {
      status: "VERIFIED";
      verified: ReadonlyArray<VerifiedProvenanceRef>;
    }
  | {
      status: "HOLD";
      reason: ProvenanceVerificationHoldReason;
    };

/**
 * Required trust subjects for CURRENT/result acceptance.
 * Logic is intentionally deferred to STEP2 so STEP1 remains a type/contract boundary.
 */
export interface RequiredProvenanceSubjects {
  evidenceRefIds: ReadonlyArray<string>;
  requireIndependentLane: boolean;
  verifierId: string | null;
}
