import {
  canonicalRevocationPayload,
  type ExternalTrustVerificationInput,
  type SignedRevocationSnapshot,
} from "./external-trust-root.js";

export interface ExternalTrustSecureBoundary {
  rootId: string;
  rootVersion: string;
  rootFingerprintSha256: string;
  minRevocationSequence: number;
  generation: number;
  provisioningEvidenceId: string;
  provisionedAt: string;
  updatedAt: string;
}

export type ExternalTrustBoundaryHoldReason =
  | "INVALID_TRUST_BOUNDARY_INPUT"
  | "ROOT_PIN_NOT_FOUND"
  | "ROOT_PIN_IMMUTABLE"
  | "ROOT_PUBLIC_KEY_REQUIRED"
  | "ROOT_FINGERPRINT_MISMATCH"
  | "GENERATION_CONFLICT"
  | "REVOCATION_ROLLBACK"
  | "REVOCATION_ROOT_MISMATCH"
  | "REVOCATION_NOT_FRESH"
  | "REVOCATION_EVIDENCE_INVALID"
  | "REVOCATION_SIGNATURE_INVALID"
  | "AUTHENTICATED_REVOCATION_REQUIRED"
  | "BACKEND_FAILURE";

export type ExternalTrustBoundaryDecision =
  | { status: "LOADED"; boundary: ExternalTrustSecureBoundary }
  | { status: "ADVANCED"; boundary: ExternalTrustSecureBoundary }
  | { status: "HOLD"; reason: ExternalTrustBoundaryHoldReason };

export interface ExternalTrustBoundaryRpcClient {
  readTrustBoundary(rootId: string, rootVersion: string): Promise<unknown>;
  advanceRevocationWatermarkAuthenticated(
    rootId: string,
    rootVersion: string,
    expectedGeneration: number,
    signedPayload: string,
    signatureBase64: string,
  ): Promise<unknown>;
}

const HOLD_REASONS = new Set<ExternalTrustBoundaryHoldReason>([
  "INVALID_TRUST_BOUNDARY_INPUT",
  "ROOT_PIN_NOT_FOUND",
  "ROOT_PIN_IMMUTABLE",
  "ROOT_PUBLIC_KEY_REQUIRED",
  "ROOT_FINGERPRINT_MISMATCH",
  "GENERATION_CONFLICT",
  "REVOCATION_ROLLBACK",
  "REVOCATION_ROOT_MISMATCH",
  "REVOCATION_NOT_FRESH",
  "REVOCATION_EVIDENCE_INVALID",
  "REVOCATION_SIGNATURE_INVALID",
  "AUTHENTICATED_REVOCATION_REQUIRED",
  "BACKEND_FAILURE",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTime(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function normalizeFingerprint(value: string): string {
  return value.trim().toLowerCase();
}

function parseBoundary(value: unknown): ExternalTrustSecureBoundary | null {
  if (!isRecord(value)) return null;
  if (
    !nonEmpty(value.rootId) ||
    !nonEmpty(value.rootVersion) ||
    !nonEmpty(value.rootFingerprintSha256) ||
    !/^[0-9a-fA-F]{64}$/.test(value.rootFingerprintSha256) ||
    !Number.isInteger(value.minRevocationSequence) ||
    (value.minRevocationSequence as number) < 0 ||
    !Number.isInteger(value.generation) ||
    (value.generation as number) < 1 ||
    !nonEmpty(value.provisioningEvidenceId) ||
    !isIsoTime(value.provisionedAt) ||
    !isIsoTime(value.updatedAt)
  ) return null;

  return {
    rootId: value.rootId,
    rootVersion: value.rootVersion,
    rootFingerprintSha256: normalizeFingerprint(value.rootFingerprintSha256),
    minRevocationSequence: value.minRevocationSequence as number,
    generation: value.generation as number,
    provisioningEvidenceId: value.provisioningEvidenceId,
    provisionedAt: value.provisionedAt,
    updatedAt: value.updatedAt,
  };
}

export function parseExternalTrustBoundaryDecision(
  raw: unknown,
  expectedRootId: string,
  expectedRootVersion: string,
  expectedStatus: "LOADED" | "ADVANCED",
  prior?: ExternalTrustSecureBoundary,
): ExternalTrustBoundaryDecision {
  if (!isRecord(raw) || typeof raw.status !== "string") {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  if (raw.status === "HOLD") {
    if (typeof raw.reason !== "string" || !HOLD_REASONS.has(raw.reason as ExternalTrustBoundaryHoldReason)) {
      return { status: "HOLD", reason: "BACKEND_FAILURE" };
    }
    return { status: "HOLD", reason: raw.reason as ExternalTrustBoundaryHoldReason };
  }

  if (raw.status !== expectedStatus) {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  const boundary = parseBoundary(raw.boundary);
  if (boundary === null) return { status: "HOLD", reason: "BACKEND_FAILURE" };
  if (boundary.rootId !== expectedRootId || boundary.rootVersion !== expectedRootVersion) {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  if (prior !== undefined) {
    if (
      boundary.rootFingerprintSha256 !== normalizeFingerprint(prior.rootFingerprintSha256) ||
      boundary.provisioningEvidenceId !== prior.provisioningEvidenceId ||
      boundary.provisionedAt !== prior.provisionedAt ||
      boundary.minRevocationSequence < prior.minRevocationSequence ||
      boundary.generation < prior.generation
    ) {
      return { status: "HOLD", reason: "BACKEND_FAILURE" };
    }
  }

  return expectedStatus === "LOADED"
    ? { status: "LOADED", boundary }
    : { status: "ADVANCED", boundary };
}

export async function loadExternalTrustBoundary(
  client: ExternalTrustBoundaryRpcClient,
  rootId: string,
  rootVersion: string,
): Promise<ExternalTrustBoundaryDecision> {
  if (!nonEmpty(rootId) || !nonEmpty(rootVersion)) {
    return { status: "HOLD", reason: "INVALID_TRUST_BOUNDARY_INPUT" };
  }
  try {
    const raw = await client.readTrustBoundary(rootId, rootVersion);
    return parseExternalTrustBoundaryDecision(raw, rootId, rootVersion, "LOADED");
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }
}

export async function advanceExternalTrustWatermarkAuthenticated(
  client: ExternalTrustBoundaryRpcClient,
  current: ExternalTrustSecureBoundary,
  revocationSnapshot: SignedRevocationSnapshot,
): Promise<ExternalTrustBoundaryDecision> {
  if (
    revocationSnapshot.rootId !== current.rootId ||
    revocationSnapshot.rootVersion !== current.rootVersion
  ) {
    return { status: "HOLD", reason: "REVOCATION_ROOT_MISMATCH" };
  }
  if (
    !Number.isInteger(revocationSnapshot.sequence) ||
    revocationSnapshot.sequence < current.minRevocationSequence
  ) {
    return { status: "HOLD", reason: "REVOCATION_ROLLBACK" };
  }
  if (!nonEmpty(revocationSnapshot.signatureBase64)) {
    return { status: "HOLD", reason: "REVOCATION_EVIDENCE_INVALID" };
  }

  const signedPayload = canonicalRevocationPayload(revocationSnapshot);
  try {
    const raw = await client.advanceRevocationWatermarkAuthenticated(
      current.rootId,
      current.rootVersion,
      current.generation,
      signedPayload,
      revocationSnapshot.signatureBase64,
    );
    const decision = parseExternalTrustBoundaryDecision(
      raw,
      current.rootId,
      current.rootVersion,
      "ADVANCED",
      current,
    );
    if (
      decision.status === "ADVANCED" &&
      decision.boundary.minRevocationSequence !== revocationSnapshot.sequence
    ) {
      return { status: "HOLD", reason: "BACKEND_FAILURE" };
    }
    return decision;
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }
}

export function bindExternalTrustInputToBoundary(
  input: Omit<ExternalTrustVerificationInput, "expectedRootFingerprintSha256" | "minRevocationSequence">,
  boundary: ExternalTrustSecureBoundary,
): ExternalTrustVerificationInput | null {
  if (input.root.rootId !== boundary.rootId || input.root.rootVersion !== boundary.rootVersion) return null;
  return {
    ...input,
    expectedRootFingerprintSha256: boundary.rootFingerprintSha256,
    minRevocationSequence: boundary.minRevocationSequence,
  };
}
