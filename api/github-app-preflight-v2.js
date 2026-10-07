module.exports = async function handler(req,res) {
  try {
    const audience='https://zdypjilutgxjsneultqj.supabase.co/functions/v1/execution-github-egress-gateway-v1';
    const token=req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
    if(!token) return res.status(401).json({ok:false,stage:'OIDC_MISSING'});
    const r=await fetch(audience+'?preflight=github-app-auth-v1',{method:'POST',headers:{Authorization:'Bearer '+token}});
    const body=await r.text();
    res.status(r.status); res.setHeader('content-type','application/json'); return res.send(body);
  } catch(e) { return res.status(500).json({ok:false,stage:'RUNTIME',error:String(e&&e.message||e)}); }
};