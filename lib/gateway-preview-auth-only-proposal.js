// Isolated proposal only. NOT wired into production Gateway v12.
// No DB, GitHub App, permit, dispatch, or external network side effects.
const {verifyPreviewToken}=require('./preview-oidc-policy');
const PREVIEW_ROUTE='preview-identity-auth-v1';
async function previewAuthOnly({method,path,token,verify=verifyPreviewToken}) {
  if(method!=='POST'||path!==PREVIEW_ROUTE) return {handled:false};
  const identity=await verify(token);
  return {handled:true,status:identity.ok?200:401,body:{
    ok:identity.ok,code:identity.ok?'PREVIEW_AUTH_ONLY_PASS':identity.code,
    execution_authorized:false
  }};
}
// Preserve the existing development preflight branch and normal permit route.
// This function may ONLY be invoked by the exact preview auth-only route.
module.exports={previewAuthOnly,PREVIEW_ROUTE};
