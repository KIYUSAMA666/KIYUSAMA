import type { CurrentStateSnapshot } from "./current-state.js";
import type { ExecutionResultEvidence } from "./execution-result-evidence.js";

/**
 * TRUST ANCHOR / PROVENANCE VERIFICATION v0.1
 *
 * STEP1 established the contracts. STEP2 adds provider-neutral verification orchestration.
 * This pillar remains OPEN/HOLD: cryptographic/key/provider trust roots are supplied by
 * external proof adapters and are not established by this module itself.
 */

export type TrustSubjectKind =
  | "EVIDENCE_REF"
  | "INDEPENDENT_LANE"
  | "VERIFIER_IDENTITY";

export type TrustAnchorStatus = "ACTIVE" | "REVOKED" | "HOLD";

/**
 * Registry entry describing which active role/authority may attest a trust subject.
 * `authorityRole` binds the anchor to CURRENT.activeRolesAndAuthority instead of trusting
 * a free-floating authorityId string. `anchorVersion` prevents silent proof reuse after
 * rotation/replacement.
 */
export interface TrustAnchor {
  anchorId: string;
  anchorVersion: string;
  subjectKind: TrustSubjectKind;
  authorityRole: string;
  authorityId: string;
  status: TrustAnchorStatus;
  validFrom: string;
  validUntil: string | null;
}

/** Canonical subject binding carried by an attestation. */
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
 * Provider-neutral proof envelope. `proofValue` is opaque here; the selected adapter must
 * independently verify it against the exact anchor and attestation envelope.
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

export interface ProvenanceProofVerificationContext {
  anchor: TrustAnchor;
  attestation: ProvenanceAttestation;
}

export type ProvenanceProofVerifier = (
  context: ProvenanceProofVerificationContext,
) => boolean;

export interface ProvenanceVerificationInput {
  current: CurrentStateSnapshot;
  result: ExecutionResultEvidence | null;
  registry: TrustAnchorRegistrySnapshot;
  attestations: ReadonlyArray<ProvenanceAttestation>;
  proofVerifiers: Readonly<Record<string, ProvenanceProofVerifier>>;
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

export interface RequiredProvenanceSubjects {
  evidenceRefIds: ReadonlyArray<string>;
  requireIndependentLane: boolean;
  verifierId: string | null;
}

interface RequiredSubject {
  kind: TrustSubjectKind;
  id: string;
  version: string | null;
  path: string | null;
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function parseTime(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Policy derivation is internal so callers cannot bypass required provenance by passing an
 * empty requirement set. Result acceptance always requires its evidence refs, independent
 * lane provenance, and verifier identity provenance.
 */
export function deriveRequiredProvenanceSubjects(
  input: Pick<ProvenanceVerificationInput, "current" | "result">,
): RequiredProvenanceSubjects {
  if (input.result !== null) {
    return {
      evidenceRefIds: [...input.result.evidenceRefIds],
      requireIndependentLane: true,
      verifierId: input.result.verifierId,
    };
  }

  return {
    evidenceRefIds: input.current.confirmedRefIndex
      .filter((ref) => ref.status === "VERIFIED")
      .map((ref) => ref.id),
    requireIndependentLane: input.current.independentLaneHealth.status === "VERIFIED",
    verifierId: null,
  };
}

function buildRequiredSubjects(
  input: ProvenanceVerificationInput,
): RequiredSubject[] | null {
  const required = deriveRequiredProvenanceSubjects(input);
  const subjects: RequiredSubject[] = [];
  const seen = new Set<string>();

  for (const refId of required.evidenceRefIds) {
    if (!nonEmpty(refId) || seen.has(`EVIDENCE_REF:${refId}`)) return null;
    const ref = input.current.confirmedRefIndex.find((candidate) => candidate.id === refId);
    if (ref === undefined || ref.status !== "VERIFIED") return null;
    seen.add(`EVIDENCE_REF:${refId}`);
    subjects.push({
      kind: "EVIDENCE_REF",
      id: ref.id,
      version: ref.expectedVersion,
      path: ref.path,
    });
  }

  if (required.requireIndependentLane) {
    const lane = input.current.independentLaneHealth;
    if (
      lane.status !== "VERIFIED" ||
      lane.evidenceVerdict !== "SUFFICIENT" ||
      !nonEmpty(lane.evidenceSource)
    ) {
      return null;
    }
    subjects.push({
      kind: "INDEPENDENT_LANE",
      id: lane.evidenceSource,
      version: null,
      path: null,
    });
  }

  if (required.verifierId !== null) {
    if (!nonEmpty(required.verifierId)) return null;
    subjects.push({
      kind: "VERIFIER_IDENTITY",
      id: required.verifierId,
      version: null,
      path: null,
    });
  }

  return subjects;
}

function subjectMatches(
  current: CurrentStateSnapshot,
  required: RequiredSubject,
  actual: ProvenanceSubjectBinding,
): boolean {
  return (
    actual.subjectKind === required.kind &&
    actual.subjectId === required.id &&
    actual.subjectVersion === required.version &&
    actual.subjectPath === required.path &&
    actual.stateId === current.identity.stateId &&
    actual.stateRevision === current.identity.stateRevision &&
    actual.lineageId === current.identity.lineageId
  );
}

function validateAttestation(
  input: ProvenanceVerificationInput,
  required: RequiredSubject,
  attestation: ProvenanceAttestation,
  nowMs: number,
): ProvenanceVerificationHoldReason | null {
  if (
    !nonEmpty(attestation.attestationId) ||
    !nonEmpty(attestation.anchorId) ||
    !nonEmpty(attestation.anchorVersion) ||
    !nonEmpty(attestation.issuerAuthorityId) ||
    !nonEmpty(attestation.proofType) ||
    !nonEmpty(attestation.proofValue)
  ) {
    return "INVALID_PROVENANCE_INPUT";
  }

  if (!subjectMatches(input.current, required, attestation.subject)) {
    return "SUBJECT_BINDING_MISMATCH";
  }

  const anchor = input.registry.anchors.find(
    (candidate) => candidate.anchorId === attestation.anchorId,
  );
  if (anchor === undefined) return "ANCHOR_NOT_FOUND";
  if (anchor.anchorVersion !== attestation.anchorVersion) return "ANCHOR_VERSION_MISMATCH";
  if (anchor.subjectKind !== required.kind) return "SUBJECT_BINDING_MISMATCH";

  if (
    !nonEmpty(anchor.anchorId) ||
    !nonEmpty(anchor.anchorVersion) ||
    !nonEmpty(anchor.authorityRole) ||
    !nonEmpty(anchor.authorityId)
  ) {
    return "INVALID_PROVENANCE_INPUT";
  }

  if (anchor.status !== "ACTIVE") return "ANCHOR_NOT_ACTIVE";

  const anchorFromMs = parseTime(anchor.validFrom);
  const anchorUntilMs = parseTime(anchor.validUntil);
  if (
    anchorFromMs === null ||
    (anchor.validUntil !== null && anchorUntilMs === null) ||
    nowMs < anchorFromMs ||
    (anchorUntilMs !== null && nowMs > anchorUntilMs)
  ) {
    return "ANCHOR_NOT_ACTIVE";
  }

  if (
    input.current.activeRolesAndAuthority[anchor.authorityRole] !== anchor.authorityId ||
    attestation.issuerAuthorityId !== anchor.authorityId
  ) {
    return "AUTHORITY_MISMATCH";
  }

  const issuedAtMs = parseTime(attestation.issuedAt);
  const expiresAtMs = parseTime(attestation.expiresAt);
  if (issuedAtMs === null || (attestation.expiresAt !== null && expiresAtMs === null)) {
    return "INVALID_PROVENANCE_INPUT";
  }
  if (nowMs < issuedAtMs || issuedAtMs < anchorFromMs) {
    return "ATTESTATION_NOT_YET_VALID";
  }
  if (
    (expiresAtMs !== null && nowMs > expiresAtMs) ||
    (anchorUntilMs !== null && issuedAtMs > anchorUntilMs)
  ) {
    return "ATTESTATION_EXPIRED";
  }

  const verifier = input.proofVerifiers[attestation.proofType];
  if (verifier === undefined) return "PROOF_UNSUPPORTED";

  try {
    if (!verifier({ anchor, attestation })) return "PROOF_INVALID";
  } catch {
    return "PROOF_INVALID";
  }

  return null;
}

/**
 * Fail-closed provenance verification.
 *
 * Every internally-derived required subject must have at least one attestation that:
 *  - binds exactly to CURRENT state/revision/lineage and expected evidence version/path;
 *  - references an ACTIVE exact-version anchor;
 *  - is issued by the authority currently assigned to the anchor's role;
 *  - is inside both anchor/attestation time windows; and
 *  - passes a registered external proof verifier.
 *
 * This establishes orchestration/binding semantics only. Trust Root establishment,
 * key custody, revocation source authenticity, and provider-adapter independence remain
 * OPEN/HOLD until separately implemented and independently audited.
 */
export function evaluateProvenanceVerification(
  input: ProvenanceVerificationInput,
): ProvenanceVerificationDecision {
  const nowMs = parseTime(input.now);
  if (
    nowMs === null ||
    !nonEmpty(input.registry.registryId) ||
    !Number.isInteger(input.registry.registryRevision) ||
    input.registry.registryRevision < 1
  ) {
    return { status: "HOLD", reason: "INVALID_PROVENANCE_INPUT" };
  }

  const anchorKeys = new Set<string>();
  for (const anchor of input.registry.anchors) {
    const key = `${anchor.anchorId}\u0000${anchor.anchorVersion}`;
    if (anchorKeys.has(key)) {
      return { status: "HOLD", reason: "INVALID_PROVENANCE_INPUT" };
    }
    anchorKeys.add(key);
  }

  const attestationIds = new Set<string>();
  for (const attestation of input.attestations) {
    if (!nonEmpty(attestation.attestationId) || attestationIds.has(attestation.attestationId)) {
      return { status: "HOLD", reason: "INVALID_PROVENANCE_INPUT" };
    }
    attestationIds.add(attestation.attestationId);
  }

  const requiredSubjects = buildRequiredSubjects(input);
  if (requiredSubjects === null) {
    return { status: "HOLD", reason: "INVALID_PROVENANCE_INPUT" };
  }

  const verified: VerifiedProvenanceRef[] = [];

  for (const required of requiredSubjects) {
    const candidates = input.attestations.filter(
      (attestation) =>
        attestation.subject.subjectKind === required.kind &&
        attestation.subject.subjectId === required.id,
    );
    if (candidates.length === 0) {
      return { status: "HOLD", reason: "REQUIRED_ATTESTATION_MISSING" };
    }

    let firstFailure: ProvenanceVerificationHoldReason | null = null;
    let accepted: ProvenanceAttestation | null = null;

    for (const candidate of candidates) {
      const failure = validateAttestation(input, required, candidate, nowMs);
      if (failure === null) {
        accepted = candidate;
        break;
      }
      firstFailure ??= failure;
    }

    if (accepted === null) {
      return {
        status: "HOLD",
        reason: firstFailure ?? "REQUIRED_ATTESTATION_MISSING",
      };
    }

    verified.push({
      subjectKind: required.kind,
      subjectId: required.id,
      attestationId: accepted.attestationId,
      anchorId: accepted.anchorId,
      anchorVersion: accepted.anchorVersion,
    });
  }

  return { status: "VERIFIED", verified };
}
