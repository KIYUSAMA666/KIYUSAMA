import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  Response.json(
    { ok: false, status: "OS2_PRODUCTION_ASYNC_COMMIT_PROBE_CLOSED" },
    { status: 410 },
  ),
);
