import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => Response.json(
  { ok: false, error: "OS2_RECOVERY_REENTRY_ATTESTATION_V01_CLOSED" },
  { status: 410 },
));
