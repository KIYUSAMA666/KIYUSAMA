// Presence is configuration evidence only; it does not certify App ownership or signing.
// Integrate before createClient/permit consumption; retain verify_jwt=true.
export async function githubAppPresencePreflight(req, env) {
  if (new URL(req.url).searchParams.get("preflight") !== "github-app-presence-v1") return null;
  const reply = (body, status) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
  if (req.method !== "POST") return reply({ok:false, code:"METHOD_NOT_ALLOWED"},405);
  const key = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || req.headers.get("Authorization") !== "Bearer " + key) {
    return reply({ok:false, code:"PREFLIGHT_UNAUTHORIZED"},401);
  }
  return reply({
    ok:true,
    evidence:"CONFIGURATION_PRESENCE_ONLY",
    has_github_app_id: Boolean(env.get("GITHUB_APP_ID")?.trim()),
    has_github_app_private_key: Boolean(env.get("GITHUB_APP_PRIVATE_KEY")?.trim())
  },200);
}
