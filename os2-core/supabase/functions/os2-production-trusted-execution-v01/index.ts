import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (_req: Request) =>
  Response.json(
    { ok: false, status: "OS2_PRODUCTION_TRUSTED_EXECUTION_V01_CLOSED" },
    { status: 410 },
  )
);
