const { createRemoteJWKSet, jwtVerify } = require('jose');
const AUDIENCE = 'https://zdypjilutgxjsneultqj.supabase.co/functions/v1/execution-github-egress-gateway-v1';
const TEAM = 'masa1234k-2475s-projects';
const PROJECT = 'kiyusama-os-write-test';
const EXPECTED = {
  sub: 'owner:' + TEAM + ':project:' + PROJECT + ':environment:preview',
  environment: 'preview', owner_id: 'team_fXvKYqVKyTPFHHgy0x5gnPas',
  project_id: 'prj_h49c19VV45FseaB40P7QIJfEq01H', owner: TEAM, project: PROJECT
};
const ISSUERS = ['https://oidc.vercel.com/' + TEAM, 'https://oidc.vercel.com'];
const jwks = createRemoteJWKSet(new URL('https://oidc.vercel.com/.well-known/jwks'));
function checkVerifiedPayload(p) {
  return Object.entries(EXPECTED).every(([k,v]) => p[k] === v)
    ? {ok:true,code:'PREVIEW_IDENTITY_PASS'}
    : {ok:false,code:'PREVIEW_IDENTITY_BLOCK'};
}
async function verifyPreviewToken(token, verify = jwtVerify, keys = jwks) {
  if (!token || typeof token !== 'string') return {ok:false,code:'TOKEN_MISSING'};
  let last = 'JWT_VERIFY_BLOCK';
  for (const issuer of ISSUERS) {
    try {
      const { payload } = await verify(token, keys, {issuer, audience:AUDIENCE});
      return checkVerifiedPayload(payload);
    } catch(e) {
      const c=String(e && e.code || '');
      last=c==='ERR_JWT_EXPIRED'?'TOKEN_EXPIRED':c==='ERR_JWS_SIGNATURE_VERIFICATION_FAILED'?'SIGNATURE_BLOCK':c==='ERR_JWKS_NO_MATCHING_KEY'?'JWKS_KEY_BLOCK':c==='ERR_JWT_CLAIM_VALIDATION_FAILED'?'CLAIM_VALIDATION_BLOCK':'JWT_VERIFY_BLOCK';
    }
  }
  return {ok:false,code:last};
}
module.exports={verifyPreviewToken,checkVerifiedPayload,EXPECTED,AUDIENCE};
