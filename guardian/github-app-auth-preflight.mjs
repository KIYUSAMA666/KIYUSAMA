import jwt from "npm:jsonwebtoken@9.0.2";

// Auth-only preflight. No permit/DB/token mint/repository_dispatch.
// Must be integrated behind the existing authorized Edge request boundary.
export async function githubAppAuthPreflight(req, env) {
  if (new URL(req.url).searchParams.get("preflight") !== "github-app-auth-v1") return null;
  const reply = (body, status) => Response.json(body, {status, headers: {"Cache-Control":"no-store"}});
  if (req.method !== "POST") return reply({ok:false,code:"METHOD_NOT_ALLOWED"},405);

  const serviceRole = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRole || req.headers.get("Authorization") !== "Bearer " + serviceRole) {
    return reply({ok:false,code:"PREFLIGHT_UNAUTHORIZED"},401);
  }

  const appId = env.get("GITHUB_APP_ID")?.trim();
  const privateKey = env.get("GITHUB_APP_PRIVATE_KEY")?.replace(/\\n/g,"\n");
  if (!appId || !privateKey) return reply({ok:false,code:"GITHUB_APP_IDENTITY_MISSING"},503);

  const now = Math.floor(Date.now()/1000);
  let appJwt;
  try {
    appJwt = jwt.sign({iat:now-60,exp:now+540,iss:appId},privateKey,{algorithm:"RS256"});
  } catch {
    return reply({ok:false,code:"GITHUB_APP_JWT_SIGN_FAILED"},503);
  }

  const r = await fetch("https://api.github.com/repos/KIYUSAMA666/KIYUSAMA/installation", {
    headers: {
      "Authorization": `Bearer ${appJwt}`,
      "Accept":"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28"
    }
  });
  if (!r.ok) return reply({ok:false,code:"GITHUB_APP_INSTALLATION_LOOKUP_FAILED",http:r.status},503);
  const body = await r.json().catch(()=>({}));
  if (!body?.id) return reply({ok:false,code:"GITHUB_APP_INSTALLATION_ID_MISSING",http:r.status},503);
  return reply({ok:true,evidence:"GITHUB_APP_AUTH_ONLY",jwt_signed:true,installation_lookup_http:r.status,installation_found:true},200);
}
