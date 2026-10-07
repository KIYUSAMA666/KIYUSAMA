const { getVercelOidcToken } = require('@vercel/oidc');
const {verifyPreviewToken,AUDIENCE} = require('../lib/preview-oidc-policy');
module.exports = async function handler(req,res) {
  res.setHeader('x-kiyusama-layer','FUNCTION');
  res.setHeader('cache-control','no-store');
  if(req.method!=='GET') return res.status(405).json({ok:false,code:'METHOD_BLOCK'});
  try {
    const token=await getVercelOidcToken({audience:AUDIENCE});
    const result=await verifyPreviewToken(token);
    res.setHeader('x-kiyusama-preview-policy',result.code);
    return res.status(result.ok?200:401).json(result);
  }catch(_){return res.status(500).json({ok:false,code:'PREVIEW_POLICY_RUNTIME_BLOCK'});}
};
