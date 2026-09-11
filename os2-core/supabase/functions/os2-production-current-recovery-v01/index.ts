import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const AUDIENCE = "kiyusama-os2-production-current-recovery-v01";
const ISSUER = "https://token.actions.githubusercontent.com";
const REPOSITORY = "KIYUSAMA666/KIYUSAMA";
const ACTOR = "KIYUSAMA666";
const WORKFLOW_PATH = ".github/workflows/os2-production-current-recovery-v01.yml";
const RPC_NAME = "os2_storage_read_current";
const STATE_ID = "OS2-PTE-V01-STATE";
const LINEAGE_ID = "OS2-PTE-V01-LINEAGE";
const MIN_COMMIT_SEQUENCE = 1;
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

async function verifyGitHubOidc(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("OIDC_MISSING");
  const token = auth.slice(7);
  const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: AUDIENCE });
  if (payload.repository !== REPOSITORY) throw new Error("OIDC_REPOSITORY_MISMATCH");
  if (payload.actor !== ACTOR) throw new Error("OIDC_ACTOR_MISMATCH");
  if (payload.event_name !== "pull_request") throw new Error("OIDC_EVENT_MISMATCH");
  const workflowRef = String(payload.job_workflow_ref ?? "");
  if (!workflowRef.startsWith(`${REPOSITORY}/${WORKFLOW_PATH}@`)) throw new Error("OIDC_WORKFLOW_MISMATCH");
  return payload;
}

function exactRequest(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  return value.stateId === STATE_ID &&
    value.lineageId === LINEAGE_ID &&
    value.minCommitSequence === MIN_COMMIT_SEQUENCE &&
    Object.keys(value).length === 3;
}

function exactCurrent(data: any): boolean {
  return Boolean(
    data &&
    data.stateId === STATE_ID &&
    data.revision === 2 &&
    Number.isInteger(data.commitSequence) &&
    data.commitSequence >= MIN_COMMIT_SEQUENCE &&
    data.current?.identity?.stateId === STATE_ID &&
    data.current?.identity?.lineageId === LINEAGE_ID &&
    data.current?.identity?.stateRevision === data.revision &&
    data.current?.identity?.scope === "KIYUSAMA_OS_2" &&
    data.current?.humanDecisionFinal?.sourceAuthority === "KIYUSAMA"
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });

  let github: Record<string, unknown>;
  try {
    github = await verifyGitHubOidc(req) as Record<string, unknown>;
  } catch (error) {
    return Response.json({ ok: false, error: String((error as Error)?.message ?? "OIDC_REJECTED") }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!exactRequest(body)) return Response.json({ ok: false, error: "ISOLATION_CONTRACT_REJECTED" }, { status: 400 });

  const url = Deno.env.get("SUPABASE_URL");
  const key = getAdminKey();
  if (!url || !key) return Response.json({ ok: false, error: "RELAY_NOT_CONFIGURED" }, { status: 503 });

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc(RPC_NAME);
  if (error) {
    return Response.json({ ok: false, error: "RPC_FAILED", code: error.code ?? null, message: error.message ?? null }, { status: 500 });
  }
  if (!exactCurrent(data)) return Response.json({ ok: false, error: "CURRENT_CONTRACT_REJECTED" }, { status: 409 });

  return Response.json({
    ok: true,
    current: data,
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
