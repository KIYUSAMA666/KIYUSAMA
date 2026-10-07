const { getVercelOidcToken } = require('@vercel/oidc');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const gateway = 'https://zdypjilutgxjsneultqj.supabase.co/functions/v1/execution-github-egress-gateway-v1';
module.exports = async function handler(req, res) {
  res.setHeader('x-kiyusama-layer', 'FUNCTION');
  try {
    const defaultToken = await getVercelOidcToken();
    const token = await getVercelOidcToken({ audience: gateway });
    const obtained = Boolean(token);
    let cryptoCode = 'TOKEN_MISSING';
    let cryptoPass = false;
    if (obtained) {
      const jwks = createRemoteJWKSet(new URL('https://oidc.vercel.com/.well-known/jwks'));
      cryptoCode = 'JWT_VERIFY_BLOCK';
      for (const issuer of ['https://oidc.vercel.com/masa1234k-2475s-projects','https://oidc.vercel.com']) {
        try { await jwtVerify(token, jwks, {issuer, audience:gateway}); cryptoPass=true; cryptoCode='SIGNATURE_ISSUER_AUDIENCE_TIME_PASS'; break; }
        catch (e) { const c=String(e && e.code || ''); if (c==='ERR_JWT_CLAIM_VALIDATION_FAILED') cryptoCode='CLAIM_VALIDATION_BLOCK'; else if(c==='ERR_JWT_EXPIRED') cryptoCode='TOKEN_EXPIRED'; else if(c==='ERR_JWS_SIGNATURE_VERIFICATION_FAILED') cryptoCode='SIGNATURE_BLOCK'; else if(c==='ERR_JWKS_NO_MATCHING_KEY') cryptoCode='JWKS_KEY_BLOCK'; else cryptoCode='JWT_VERIFY_BLOCK'; }
      }
    }
    res.setHeader('x-kiyusama-crypto-check', cryptoCode);
    const payload = obtained ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) : {};
    const expectedSub = 'owner:masa1234k-2475s-projects:project:kiyusama-os-write-test:environment:development';
    const expectedIssuers = ['https://oidc.vercel.com/masa1234k-2475s-projects','https://oidc.vercel.com'];
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const claimMatches = { issuer: expectedIssuers.includes(payload.iss), audience: aud.includes(gateway), subject: payload.sub === expectedSub, environment: payload.environment === 'development', owner_id: payload.owner_id === 'team_fXvKYqVKyTPFHHgy0x5gnPas', project_id: payload.project_id === 'prj_h49c19VV45FseaB40P7QIJfEq01H', owner: payload.owner === 'masa1234k-2475s-projects', project: payload.project === 'kiyusama-os-write-test' };
    res.setHeader('x-kiyusama-claim-check', Object.entries(claimMatches).filter(([,v])=>!v).map(([k])=>k).join(',') || 'ALL_MATCH');
    if (!obtained) return res.status(401).json({ok:false,stage:'OIDC_MISSING',oidc_obtained:false,default_oidc_obtained:Boolean(defaultToken),layer:'FUNCTION'});
    const r = await fetch(gateway+'?preflight=github-app-auth-v1',{method:'POST',headers:{Authorization:'Bearer '+token}});
    const contentType = r.headers.get('content-type') || '';
    const raw = await r.text();
    let safeCode = 'UNKNOWN';
    if (contentType.includes('json')) {
      try { const j=JSON.parse(raw); const candidate=j.stage || j.code || j.error_code;
        if (typeof candidate==='string' && /^[A-Za-z0-9_-]{1,70}$/.test(candidate)) safeCode=candidate;
      } catch (_) {}
    }
    return res.status(r.status).json({ok:r.ok,oidc_obtained:true,default_oidc_obtained:Boolean(defaultToken),layer:'FUNCTION',upstream_layer:r.headers.get('x-vercel-id')?'VERCEL_OR_UNKNOWN':'GATEWAY_OR_UNKNOWN',gateway_http:r.status,gateway_code:safeCode,claim_matches:claimMatches,claim_signature_verified:cryptoPass,crypto_code:cryptoCode});
  } catch (_) { return res.status(500).json({ok:false,stage:'PREFLIGHT_RUNTIME',layer:'FUNCTION'}); }
};
