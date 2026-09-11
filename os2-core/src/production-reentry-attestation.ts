import type { RecoveryReentryAttestation } from "./recovery-reentry-gate.js";

const SUPABASE_READ_REENTRY_ATTESTATION_RPC = "os2_reentry_read_attestation";

export interface RecoveryReentryAttestationBinding {
  attestationId: string;
  stateId: string;
  lineageId: string;
  stateRevision: number;
  commitSequence: number;
}

export interface RecoveryReentryIssuerExpectation {
  repository: string;
  actor: string;
  eventName: string;
  ref: string;
  sha: string;
  workflowRef: string;
  evidenceRunId: string;
  evidenceJobId: string;
}

export interface DurableRecoveryReentryAttestation extends RecoveryReentryAttestation {
  attestationId: string;
  issuerRepository: string;
  issuerActor: string;
  issuerEventName: string;
  issuerRef: string;
  issuerSha: string;
  issuerWorkflowRef: string;
  evidenceRunId: string;
  evidenceJobId: string;
}

export interface RecoveryReentryAttestationReadClient {
  readAttestation(attestationId: string): Promise<unknown>;
}

export interface SupabaseJsReentryAttestationClientLike {
  rpc(
    functionName: string,
    args: { p_attestation_id: string },
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export type ProductionReentryAttestationDecision =
  | { status: "VERIFIED"; attestation: DurableRecoveryReentryAttestation }
  | {
      status: "HOLD";
      reason:
        | "MISSING_ATTESTATION"
        | "MALFORMED_ATTESTATION"
        | "ATTESTATION_BINDING_MISMATCH"
        | "ATTESTATION_ISSUER_MISMATCH"
        | "BACKEND_FAILURE";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseAttestation(raw: unknown): DurableRecoveryReentryAttestation | null {
  if (!isRecord(raw)) return null;
  if (
    !nonEmpty(raw.attestationId) ||
    !nonEmpty(raw.stateId) ||
    !nonEmpty(raw.lineageId) ||
    !Number.isInteger(raw.stateRevision) || (raw.stateRevision as number) < 1 ||
    !Number.isInteger(raw.commitSequence) || (raw.commitSequence as number) < 0 ||
    raw.status !== "VERIFIED" ||
    raw.evidenceVerdict !== "SUFFICIENT" ||
    !nonEmpty(raw.observedAt) || !Number.isFinite(Date.parse(raw.observedAt)) ||
    raw.evidenceSource !== "KIRA_INDEPENDENT_GITHUB_OIDC" ||
    !nonEmpty(raw.issuerRepository) ||
    !nonEmpty(raw.issuerActor) ||
    !nonEmpty(raw.issuerEventName) ||
    !nonEmpty(raw.issuerRef) ||
    !nonEmpty(raw.issuerSha) ||
    !nonEmpty(raw.issuerWorkflowRef) ||
    !nonEmpty(raw.evidenceRunId) ||
    !nonEmpty(raw.evidenceJobId)
  ) return null;

  return structuredClone(raw) as unknown as DurableRecoveryReentryAttestation;
}

export function createSupabaseJsRecoveryReentryAttestationClient(
  client: SupabaseJsReentryAttestationClientLike,
): RecoveryReentryAttestationReadClient {
  return {
    async readAttestation(attestationId: string): Promise<unknown> {
      const { data, error } = await client.rpc(SUPABASE_READ_REENTRY_ATTESTATION_RPC, {
        p_attestation_id: attestationId,
      });
      if (error !== null) throw error;
      return data;
    },
  };
}

export async function loadProductionRecoveryReentryAttestation(
  client: RecoveryReentryAttestationReadClient,
  binding: RecoveryReentryAttestationBinding,
  issuer: RecoveryReentryIssuerExpectation,
): Promise<ProductionReentryAttestationDecision> {
  let raw: unknown;
  try {
    raw = await client.readAttestation(binding.attestationId);
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }

  if (raw === null || raw === undefined) {
    return { status: "HOLD", reason: "MISSING_ATTESTATION" };
  }

  const attestation = parseAttestation(raw);
  if (attestation === null) {
    return { status: "HOLD", reason: "MALFORMED_ATTESTATION" };
  }

  if (
    attestation.attestationId !== binding.attestationId ||
    attestation.stateId !== binding.stateId ||
    attestation.lineageId !== binding.lineageId ||
    attestation.stateRevision !== binding.stateRevision ||
    attestation.commitSequence !== binding.commitSequence
  ) {
    return { status: "HOLD", reason: "ATTESTATION_BINDING_MISMATCH" };
  }

  if (
    attestation.issuerRepository !== issuer.repository ||
    attestation.issuerActor !== issuer.actor ||
    attestation.issuerEventName !== issuer.eventName ||
    attestation.issuerRef !== issuer.ref ||
    attestation.issuerSha !== issuer.sha ||
    attestation.issuerWorkflowRef !== issuer.workflowRef ||
    attestation.evidenceRunId !== issuer.evidenceRunId ||
    attestation.evidenceJobId !== issuer.evidenceJobId
  ) {
    return { status: "HOLD", reason: "ATTESTATION_ISSUER_MISMATCH" };
  }

  return { status: "VERIFIED", attestation };
}
