import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

export type ExternalTrustAlgorithm = "ED25519";

export interface ExternalTrustRoot {
  rootId: string;
  rootVersion: string;
  algorithm: ExternalTrustAlgorithm;
  publicKeyPem: string;
  validFrom: string;
  validUntil: string | null;
}

export interface DelegatedProofKey {
  proofKeyId: string;
  rootId: string;
  rootVersion: string;
  proofType: string;
  algorithm: ExternalTrustAlgorithm;
  publicKeyPem: string;
  publicKeyFingerprintSha256: string;
  validFrom: string;
  validUntil: string | null;
  delegationSignatureBase64: string;
}

export interface SignedRevocationSnapshot {
  snapshotId: string;
  rootId: string;
  rootVersion: string;
  sequence: number;
  issuedAt: string;
  expiresAt: string;
  revokedProofKeyIds: ReadonlyArray<string>;
  signatureBase64: string;
}

export interface ExternalTrustVerificationInput {
  root: ExternalTrustRoot;
  expectedRootFingerprintSha256: string;
  delegatedProofKeys: ReadonlyArray<DelegatedProofKey>;
  revocationSnapshot: SignedRevocationSnapshot;
  minRevocationSequence: number;
  now: string;
}

export interface VerifiedDelegatedProofKey {
  proofKeyId: string;
  proofType: string;
  algorithm: ExternalTrustAlgorithm;
  publicKeyPem: string;
  publicKeyFingerprintSha256: string;
  validFrom: string;
  validUntil: string | null;
  revoked: boolean;
}

export interface VerifiedExternalTrustContext {
  rootId: string;
  rootVersion: string;
  rootPublicKeyPem: string;
  rootFingerprintSha256: string;
  revocationSnapshotId: string;
  revocationSequence: number;
  verifiedAt: string;
  delegatedProofKeys: ReadonlyArray<VerifiedDelegatedProofKey>;
}

export type ExternalTrustHoldReason =
  | "INVALID_EXTERNAL_TRUST_INPUT"
  | "ROOT_FINGERPRINT_MISMATCH"
  | "ROOT_NOT_ACTIVE"
  | "REVOCATION_ROOT_MISMATCH"
  | "REVOCATION_ROLLBACK"
  | "REVOCATION_NOT_FRESH"
  | "REVOCATION_SIGNATURE_INVALID"
  | "DELEGATION_ROOT_MISMATCH"
  | "DELEGATED_KEY_FINGERPRINT_MISMATCH"
  | "DELEGATION_SIGNATURE_INVALID";

export type ExternalTrustVerificationDecision =
  | { status: "VERIFIED"; context: VerifiedExternalTrustContext }
  | { status: "HOLD"; reason: ExternalTrustHoldReason };

export type ExternalProofVerificationReason =
  | "PROOF_KEY_NOT_TRUSTED"
  | "PROOF_KEY_REVOKED"
  | "PROOF_KEY_NOT_ACTIVE"
  | "PROOF_TYPE_MISMATCH"
  | "PROOF_SIGNATURE_INVALID";

export type ExternalProofVerificationDecision =
  | { status: "VERIFIED" }
  | { status: "HOLD"; reason: ExternalProofVerificationReason };

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function parseTime(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFingerprint(value: string): string {
  return value.trim().toLowerCase();
}

export function publicKeyFingerprintSha256(publicKeyPem: string): string | null {
  try {
    const key = createPublicKey(publicKeyPem);
    const der = key.export({ type: "spki", format: "der" });
    return createHash("sha256").update(der).digest("hex");
  } catch {
    return null;
  }
}

function verifyEd25519(publicKeyPem: string, payload: string, signatureBase64: string): boolean {
  try {
    const signature = Buffer.from(signatureBase64, "base64");
    if (signature.length === 0) return false;
    return verifySignature(null, Buffer.from(payload, "utf8"), publicKeyPem, signature);
  } catch {
    return false;
  }
}

export function canonicalDelegationPayload(key: DelegatedProofKey): string {
  return JSON.stringify({
    proofKeyId: key.proofKeyId,
    rootId: key.rootId,
    rootVersion: key.rootVersion,
    proofType: key.proofType,
    algorithm: key.algorithm,
    publicKeyFingerprintSha256: key.publicKeyFingerprintSha256,
    validFrom: key.validFrom,
    validUntil: key.validUntil,
  });
}

export function canonicalRevocationPayload(snapshot: SignedRevocationSnapshot): string {
  return JSON.stringify({
    snapshotId: snapshot.snapshotId,
    rootId: snapshot.rootId,
    rootVersion: snapshot.rootVersion,
    sequence: snapshot.sequence,
    issuedAt: snapshot.issuedAt,
    expiresAt: snapshot.expiresAt,
    revokedProofKeyIds: [...snapshot.revokedProofKeyIds],
  });
}

export function evaluateExternalTrustRoot(
  input: ExternalTrustVerificationInput,
): ExternalTrustVerificationDecision {
  const nowMs = parseTime(input.now);
  const rootFromMs = parseTime(input.root.validFrom);
  const rootUntilMs = parseTime(input.root.validUntil);
  const revocationIssuedMs = parseTime(input.revocationSnapshot.issuedAt);
  const revocationExpiresMs = parseTime(input.revocationSnapshot.expiresAt);

  if (
    nowMs === null ||
    rootFromMs === null ||
    (input.root.validUntil !== null && rootUntilMs === null) ||
    revocationIssuedMs === null ||
    revocationExpiresMs === null ||
    !nonEmpty(input.root.rootId) ||
    !nonEmpty(input.root.rootVersion) ||
    !nonEmpty(input.root.publicKeyPem) ||
    !nonEmpty(input.expectedRootFingerprintSha256) ||
    !nonEmpty(input.revocationSnapshot.snapshotId) ||
    !Number.isInteger(input.revocationSnapshot.sequence) ||
    input.revocationSnapshot.sequence < 1 ||
    !Number.isInteger(input.minRevocationSequence) ||
    input.minRevocationSequence < 0 ||
    revocationExpiresMs <= revocationIssuedMs
  ) {
    return { status: "HOLD", reason: "INVALID_EXTERNAL_TRUST_INPUT" };
  }

  const actualRootFingerprint = publicKeyFingerprintSha256(input.root.publicKeyPem);
  if (
    actualRootFingerprint === null ||
    normalizeFingerprint(actualRootFingerprint) !==
      normalizeFingerprint(input.expectedRootFingerprintSha256)
  ) {
    return { status: "HOLD", reason: "ROOT_FINGERPRINT_MISMATCH" };
  }

  if (
    nowMs < rootFromMs ||
    (rootUntilMs !== null && nowMs > rootUntilMs)
  ) {
    return { status: "HOLD", reason: "ROOT_NOT_ACTIVE" };
  }

  const revocation = input.revocationSnapshot;
  if (
    revocation.rootId !== input.root.rootId ||
    revocation.rootVersion !== input.root.rootVersion
  ) {
    return { status: "HOLD", reason: "REVOCATION_ROOT_MISMATCH" };
  }

  if (revocation.sequence < input.minRevocationSequence) {
    return { status: "HOLD", reason: "REVOCATION_ROLLBACK" };
  }

  if (nowMs < revocationIssuedMs || nowMs > revocationExpiresMs) {
    return { status: "HOLD", reason: "REVOCATION_NOT_FRESH" };
  }

  const revokedIds = new Set<string>();
  for (const proofKeyId of revocation.revokedProofKeyIds) {
    if (!nonEmpty(proofKeyId) || revokedIds.has(proofKeyId)) {
      return { status: "HOLD", reason: "INVALID_EXTERNAL_TRUST_INPUT" };
    }
    revokedIds.add(proofKeyId);
  }

  if (
    !nonEmpty(revocation.signatureBase64) ||
    !verifyEd25519(
      input.root.publicKeyPem,
      canonicalRevocationPayload(revocation),
      revocation.signatureBase64,
    )
  ) {
    return { status: "HOLD", reason: "REVOCATION_SIGNATURE_INVALID" };
  }

  const seenProofKeyIds = new Set<string>();
  const verifiedKeys: VerifiedDelegatedProofKey[] = [];

  for (const key of input.delegatedProofKeys) {
    if (
      !nonEmpty(key.proofKeyId) ||
      seenProofKeyIds.has(key.proofKeyId) ||
      !nonEmpty(key.proofType) ||
      !nonEmpty(key.publicKeyPem) ||
      !nonEmpty(key.publicKeyFingerprintSha256) ||
      !nonEmpty(key.delegationSignatureBase64)
    ) {
      return { status: "HOLD", reason: "INVALID_EXTERNAL_TRUST_INPUT" };
    }
    seenProofKeyIds.add(key.proofKeyId);

    if (key.rootId !== input.root.rootId || key.rootVersion !== input.root.rootVersion) {
      return { status: "HOLD", reason: "DELEGATION_ROOT_MISMATCH" };
    }

    const keyFingerprint = publicKeyFingerprintSha256(key.publicKeyPem);
    if (
      keyFingerprint === null ||
      normalizeFingerprint(keyFingerprint) !== normalizeFingerprint(key.publicKeyFingerprintSha256)
    ) {
      return { status: "HOLD", reason: "DELEGATED_KEY_FINGERPRINT_MISMATCH" };
    }

    const validFromMs = parseTime(key.validFrom);
    const validUntilMs = parseTime(key.validUntil);
    if (
      validFromMs === null ||
      (key.validUntil !== null && validUntilMs === null) ||
      (validUntilMs !== null && validUntilMs <= validFromMs)
    ) {
      return { status: "HOLD", reason: "INVALID_EXTERNAL_TRUST_INPUT" };
    }

    if (
      !verifyEd25519(
        input.root.publicKeyPem,
        canonicalDelegationPayload(key),
        key.delegationSignatureBase64,
      )
    ) {
      return { status: "HOLD", reason: "DELEGATION_SIGNATURE_INVALID" };
    }

    verifiedKeys.push({
      proofKeyId: key.proofKeyId,
      proofType: key.proofType,
      algorithm: key.algorithm,
      publicKeyPem: key.publicKeyPem,
      publicKeyFingerprintSha256: keyFingerprint,
      validFrom: key.validFrom,
      validUntil: key.validUntil,
      revoked: revokedIds.has(key.proofKeyId),
    });
  }

  return {
    status: "VERIFIED",
    context: {
      rootId: input.root.rootId,
      rootVersion: input.root.rootVersion,
      rootPublicKeyPem: input.root.publicKeyPem,
      rootFingerprintSha256: actualRootFingerprint,
      revocationSnapshotId: revocation.snapshotId,
      revocationSequence: revocation.sequence,
      verifiedAt: input.now,
      delegatedProofKeys: verifiedKeys,
    },
  };
}

export function verifyRootSignedPayload(
  context: VerifiedExternalTrustContext,
  payload: string,
  signatureBase64: string,
): boolean {
  if (!nonEmpty(payload) || !nonEmpty(signatureBase64)) return false;
  return verifyEd25519(context.rootPublicKeyPem, payload, signatureBase64);
}

export function verifyDelegatedProof(
  context: VerifiedExternalTrustContext,
  proofKeyId: string,
  proofType: string,
  payload: string,
  signatureBase64: string,
  now: string,
): ExternalProofVerificationDecision {
  const nowMs = parseTime(now);
  if (nowMs === null || !nonEmpty(proofKeyId) || !nonEmpty(proofType) || !nonEmpty(payload)) {
    return { status: "HOLD", reason: "PROOF_SIGNATURE_INVALID" };
  }

  const key = context.delegatedProofKeys.find((candidate) => candidate.proofKeyId === proofKeyId);
  if (key === undefined) return { status: "HOLD", reason: "PROOF_KEY_NOT_TRUSTED" };
  if (key.revoked) return { status: "HOLD", reason: "PROOF_KEY_REVOKED" };
  if (key.proofType !== proofType) return { status: "HOLD", reason: "PROOF_TYPE_MISMATCH" };

  const validFromMs = parseTime(key.validFrom);
  const validUntilMs = parseTime(key.validUntil);
  if (
    validFromMs === null ||
    nowMs < validFromMs ||
    (validUntilMs !== null && nowMs > validUntilMs)
  ) {
    return { status: "HOLD", reason: "PROOF_KEY_NOT_ACTIVE" };
  }

  if (!verifyEd25519(key.publicKeyPem, payload, signatureBase64)) {
    return { status: "HOLD", reason: "PROOF_SIGNATURE_INVALID" };
  }

  return { status: "VERIFIED" };
}
