import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const AUDIENCE = "kiyusama-os2-recovery-reentry-attestation-v01";
const ISSUER = "https://token.actions.githubusercontent.com";
const POLICY_ID = "OS2-RRG-V01";
const ISSUE_RPC = "os2_reentry_issue_attestation";
const READ_RPC = "os2_reentry_read_attestation";
const READ_CURRENT_RPC = "os2_storage_read_current";
const POLICY_RPC = "os2_reentry_read_issuer_policy";
const ATTESTATION_ID = "OS2-RRG-V01-ATTEST-001";
const STATE_ID = "OS2-PTE-V01-STATE";
const LINEAGE_ID = "OS2-PTE-V01-LINEAGE";
const STATE_REVISION = 2;
const COMMIT_SEQUENCE = 1;
const EVIDENCE_RUN_ID = "34592393362";
const EVIDENCE_JOB_ID = "103240868540";
const jwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function getAdminKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function verifyGitHubOidc(req: Request, admin: ReturnType<typeof createClient>) {
  const { data: policy, error: policyError } = await admin.rpc(POLICY_RPC, { p_policy_id: POLICY_ID });
  if (policyError || !isRecord(policy)) throw new Error("ISSUER_POLICY_UNAVAILABLE");
  if (
    typeof policy.repository !== "string" ||
    typeof policy.actor !== "string" ||
    typeof policy.eventName !== "string" ||
    typeof policy.ref !== "string" ||
    typeof policy.workflowPath !== "string" ||
    typeof policy.expectedSha !== "string" ||
    !policy.expectedSha.trim()
  ) throw new Error("ISSUER_POLICY_NOT_PINNED");

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("OIDC_MISSING");
  const token = auth.slice(7);
  const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: AUDIENCE });
  if (payload.repository !== policy.repository) throw new Error("OIDC_REPOSITORY_MISMATCH");
  if (payload.actor !== policy.actor) throw new Error("OIDC_ACTOR_MISMATCH");
  if (payload.event_name !== policy.eventName) throw new Error("OIDC_EVENT_MISMATCH");
  if (payload.ref !== policy.ref) throw new Error("OIDC_REF_MISMATCH");
  if (payload.sha !== policy.expectedSha) throw new Error("OIDC_SHA_MISMATCH");
  const workflowRef = String(payload.job_workflow_ref ?? "");
  if (!workflowRef.startsWith(`${policy.repository}/${policy.workflowPath}@`)) throw new Error("OIDC_WORKFLOW_MISMATCH");
  return payload;
}

function exactRequest(body: any): boolean {
  const request = body?.request;
  return Boolean(
    request &&
    request.attestationId === ATTESTATION_ID &&
    request.stateId === STATE_ID &&
    request.lineageId === LINEAGE_ID &&
    request.stateRevision === STATE_REVISION &&
    request.commitSequence === COMMIT_SEQUENCE &&
    request.evidenceRunId === EVIDENCE_RUN_ID &&
    request.evidenceJobId === EVIDENCE_JOB_ID
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });

  const url = Deno.env.get("SUPABASE_URL");
  const key = getAdminKey();
  if (!url || !key) return Response.json({ ok: false, error: "RELAY_NOT_CONFIGURED" }, { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let github: Record<string, unknown>;
  try {
    github = await verifyGitHubOidc(req, admin) as Record<string, unknown>;
  } catch (error) {
    return Response.json({ ok: false, error: String((error as Error)?.message ?? "OIDC_REJECTED") }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!exactRequest(body)) return Response.json({ ok: false, error: "ISOLATION_CONTRACT_REJECTED" }, { status: 400 });

  const issueRequest = {
    ...body.request,
    issuerRepository: github.repository,
    issuerActor: github.actor,
    issuerEventName: github.event_name,
    issuerRef: github.ref,
    issuerSha: github.sha,
    issuerWorkflowRef: github.job_workflow_ref,
  };

  const { data: issued, error: issueError } = await admin.rpc(ISSUE_RPC, { p_request: issueRequest });
  if (issueError) return Response.json({ ok: false, error: "ISSUE_RPC_FAILED", message: issueError.message ?? null }, { status: 500 });
  if (issued?.status !== "ISSUED") return Response.json({ ok: false, error: "ATTESTATION_NOT_ISSUED", result: issued }, { status: 409 });

  const { data: readback, error: readError } = await admin.rpc(READ_RPC, { p_attestation_id: ATTESTATION_ID });
  if (readError) return Response.json({ ok: false, error: "READBACK_RPC_FAILED", message: readError.message ?? null }, { status: 500 });

  const { data: currentReadback, error: currentError } = await admin.rpc(READ_CURRENT_RPC);
  if (currentError) return Response.json({ ok: false, error: "CURRENT_READBACK_FAILED", message: currentError.message ?? null }, { status: 500 });

  return Response.json({
    ok: true,
    issued,
    readback,
    currentReadback,
    github: {
      repository: github.repository ?? null,
      actor: github.actor ?? null,
      event_name: github.event_name ?? null,
      ref: github.ref ?? null,
      sha: github.sha ?? null,
      job_workflow_ref: github.job_workflow_ref ?? null,
    },
    deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") ?? null,
  });
});
