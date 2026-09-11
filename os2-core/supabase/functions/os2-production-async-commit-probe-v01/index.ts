import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROBE_TOKEN = "dUv7_hQVzQPi1BUvLv_QYYuBAnP41nnmWAcWXKWzXUk";
const RPC_NAME = "os2_storage_compare_consume_and_swap";

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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
  }

  if (req.headers.get("x-os2-probe-token") !== PROBE_TOKEN) {
    return Response.json({ ok: false, error: "UNAUTHORIZED_PROBE" }, { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = getAdminKey();
  if (!url || !key) {
    return Response.json({ ok: false, error: "PROBE_NOT_CONFIGURED" }, { status: 503 });
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const probeCommand = {
    expectedCurrentStateId: "os2-http-probe-state",
    expectedCurrentRevision: 1,
    consumeResultId: "os2-http-probe-result",
    consumeHandoffId: "os2-http-probe-handoff",
    nextCurrent: {
      identity: {
        stateId: "os2-http-probe-state",
        stateRevision: 2,
      },
      writeBack: {
        parent: {
          parentStateId: "os2-http-probe-state",
          parentRevision: 1,
        },
        source: {
          sourceResultId: "os2-http-probe-result",
          sourceHandoffId: "os2-http-probe-handoff",
        },
      },
      humanDecisionFinal: {
        sourceAuthority: "KIYUSAMA",
      },
    },
  };

  const { data, error } = await admin.rpc(RPC_NAME, { p_command: probeCommand });
  if (error) {
    return Response.json(
      {
        ok: false,
        rpc: RPC_NAME,
        error: "RPC_FAILED",
        code: error.code ?? null,
        message: error.message ?? null,
        deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") ?? null,
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    rpc: RPC_NAME,
    result: data,
    deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") ?? null,
  });
});
