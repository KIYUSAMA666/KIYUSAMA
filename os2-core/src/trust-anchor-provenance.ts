import type { CurrentStateSnapshot } from "./current-state.js";
import type { ExecutionResultEvidence } from "./execution-result-evidence.js";
import {
  evaluateExternalTrustRoot,
  verifyDelegatedProof,
  verifyRootSignedPayload,
  type ExternalTrustVerificationInput,
  type VerifiedExternalTrustContext,
} from "./external-trust-root.js";

/**
 * TRUST ANCHOR / PROVENANCE VERIFICATION v0.1 + EXTERNAL TRUST ROOT integration.
 *
 * The caller no longer supplies arbitrary proof-verifier callbacks. Provenance verification
 * validates the pinned external root, signed revocation snapshot, root-signed registry, and
 * root-delegated Ed25519 proof keys internally before accepting any attestation.
 */

export type TrustSubjectKind =
  | "EVIDENCE_REF"
  | "INDEPENDENT_LANE"
  | "VERIFIER_IDENTITY";

export type TrustAnchorStatus = "ACTIVE" | "REVOKED" | "HOLD";

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

export interface ProvenanceSubjectBinding {
  subjectKind: TrustSubjectKind;
  subjectId: string;
  subjectVersion: string | null;
  subjectPath: string | null;
  stateId: string;
  stateRevision: number;
  lineageId: string;
}

export interface ProvenanceAttestation {
  attestationId: string;
  anchorId: string;
  anchorVersion: string;
  issuerAuthorityId: string;
  subject: ProvenanceSubjectBinding;
  issuedAt: string;
  expiresAt: string | null;
  proofType: string;
  proofKeyId: string;
  proofValue: string;
}

export interface TrustAnchorRegistrySnapshot {
  registryId: string;
  registryRevision: number;
  anchors: ReadonlyArray<TrustAnchor>;
  rootSignatureBase64: string;
}

export interface ProvenanceVerificationInput {
  current: CurrentStateSnapshot;
  result: ExecutionResultEvidence | null;
  registry: TrustAnchorRegistrySnapshot;
  attestations: ReadonlyArray<ProvenanceAttestation>;
  externalTrust: ExternalTrustVerificationInput;
  now: string;
}

export type ProvenanceVerificationHoldReason =
  | "INVALID_PROVENANCE_INPUT"
  | "EXTERNAL_TRUST_NOT_VERIFIED"
  | "REGISTRY_SIGNATURE_INVALID"
  | "ANCHOR_NOT_FOUND"
  | "ANCHOR_NOT_ACTIVE"
  | "ANCHOR_VERSION_MISMATCH"
  | "AUTHORITY_MISMATCH"
  | "SUBJECT_BINDING_MISMATCH"
  | "ATTESTATION_EXPIRED"
  | "ATTESTATION_NOT_YET_VALID"
  | "PROOF_KEY_NOT_TRUSTED"
  | "PROOF_KEY_REVOKED"
  | "PROOF_KEY_NOT_ACTIVE"
  | "PROOF_TYPE_MISMATCH"
  | "PROOF_AUTHORITY_MISMATCH"
  | "PROOF_INVALID"
  | "REQUIRED_ATTESTATION_MISSING";

export interface VerifiedProvenanceRef {
  subjectKind: TrustSubjectKind;
  subjectId: string;
  attestationId: string;
  anchorId: string;
  anchorVersion: string;
  proofKeyId: string;
}

export type ProvenanceVerificationDecision =
  | {
      status: "VERIFIED";
      verified: ReadonlyArray<VerifiedProvenanceRef>;
      externalTrust: {
        rootId: string;
        rootVersion: string;
        rootFingerprintSha256: string;
        revocationSequence: number;
      };
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

export function canonicalTrustAnchorRegistryPayload(
  registry: TrustAnchorRegistrySnapshot,
): string {
  return JSON.stringify({
    registryId: registry.registryId,
    registryRevision: registry.registryRevision,
    anchors: registry.anchors.map((anchor) => ({
      anchorId: anchor.anchorId,
      anchorVersion: anchor.anchorVersion,
      subjectKind: anchor.subjectKind,
      authorityRole: anchor.authorityRole,
      authorityId: anchor.authorityId,
      status: anchor.status,
      validFrom: anchor.validFrom,
      validUntil: anchor.validUntil,
    })),
  });
}

export function canonicalProvenanceAttestationPayload(
  attestation: ProvenanceAttestation,
): string {
  return JSON.stringify({
    attestationId: attestation.attestationId,
    anchorId: attestation.anchorId,
    anchorVersion: attestation.anchorVersion,
    issuerAuthorityId: attestation.issuerAuthorityId,
    subject: {
      subjectKind: attestation.subject.subjectKind,
      subjectId: attestation.subject.subjectId,
      subjectVersion: attestation.subject.subjectVersion,
      subjectPath: attestation.subject.subjectPath,
      stateId: attestation.subject.stateId,
      stateRevision: attestation.subject.stateRevision,
      lineageId: attestation.subject.lineageId,
    },
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
    proofType: attestation.proofType,
    proofKeyId: attestation.proofKeyId,
  });
}

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

function mapExternalProofFailure(
  reason:
    | "PROOF_KEY_NOT_TRUSTED"
    | "PROOF_KEY_REVOKED"
    | "PROOF_KEY_NOT_ACTIVE"
    | "PROOF_TYPE_MISMATCH"
    | "PROOF_AUTHORITY_MISMATCH"
    | "PROOF_SIGNATURE_INVALID",
): ProvenanceVerificationHoldReason {
  switch (reason) {
    case "PROOF_KEY_NOT_TRUSTED":
    case "PROOF_KEY_REVOKED":
    case "PROOF_KEY_NOT_ACTIVE":
    case "PROOF_TYPE_MISMATCH":
    case "PROOF_AUTHORITY_MISMATCH":
      return reason;
    case "PROOF_SIGNATURE_INVALID":
      return "PROOF_INVALID";
  }
}

function validateAttestation(
  input: ProvenanceVerificationInput,
  externalTrust: VerifiedExternalTrustContext,
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
    !nonEmpty(attestation.proofKeyId) ||
    !nonEmpty(attestation.proofValue)
  ) {
    return "INVALID_PROVENANCE_INPUT";
  }

  if (!subjectMatches(input.current, required, attestation.subject)) {
    return "SUBJECT_BINDING_MISMATCH";
  }

  const anchor = input.registry.anchors.find(
    (candidate) =>
      candidate.anchorId === attestation.anchorId &&
      candidate.anchorVersion === attestation.anchorVersion,
  );
  if (anchor === undefined) {
    const sameIdExists = input.registry.anchors.some(
      (candidate) => candidate.anchorId === attestation.anchorId,
    );
    return sameIdExists ? "ANCHOR_VERSION_MISMATCH" : "ANCHOR_NOT_FOUND";
  }
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

  const proofDecision = verifyDelegatedProof(
    externalTrust,
    attestation.proofKeyId,
    attestation.issuerAuthorityId,
    attestation.proofType,
    canonicalProvenanceAttestationPayload(attestation),
    attestation.proofValue,
    input.now,
  );
  if (proofDecision.status !== "VERIFIED") {
    return mapExternalProofFailure(proofDecision.reason);
  }

  return null;
}

export function evaluateProvenanceVerification(
  input: ProvenanceVerificationInput,
): ProvenanceVerificationDecision {
  const nowMs = parseTime(input.now);
  if (
    nowMs === null ||
    !nonEmpty(input.registry.registryId) ||
    !Number.isInteger(input.registry.registryRevision) ||
    input.registry.registryRevision < 1 ||
    !nonEmpty(input.registry.rootSignatureBase64)
  ) {
    return { status: "HOLD", reason: "INVALID_PROVENANCE_INPUT" };
  }

  if (input.externalTrust.now !== input.now) {
    return { status: "HOLD", reason: "INVALID_PROVENANCE_INPUT" };
  }

  const externalTrustDecision = evaluateExternalTrustRoot(input.externalTrust);
  if (externalTrustDecision.status !== "VERIFIED") {
    return { status: "HOLD", reason: "EXTERNAL_TRUST_NOT_VERIFIED" };
  }
  const externalTrust = externalTrustDecision.context;

  if (
    !verifyRootSignedPayload(
      externalTrust,
      canonicalTrustAnchorRegistryPayload(input.registry),
      input.registry.rootSignatureBase64,
    )
  ) {
    return { status: "HOLD", reason: "REGISTRY_SIGNATURE_INVALID" };
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
      const failure = validateAttestation(
        input,
        externalTrust,
        required,
        candidate,
        nowMs,
      );
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
      proofKeyId: accepted.proofKeyId,
    });
  }

  return {
    status: "VERIFIED",
    verified,
    externalTrust: {
      rootId: externalTrust.rootId,
      rootVersion: externalTrust.rootVersion,
      rootFingerprintSha256: externalTrust.rootFingerprintSha256,
      revocationSequence: externalTrust.revocationSequence,
    },
  };
}
