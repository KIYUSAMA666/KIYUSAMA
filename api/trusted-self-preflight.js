const { getVercelOidcToken } = require('@vercel/oidc');
module.exports = async function handler(req, res) {
  res.setHeader('x-kiyusama-layer', 'FUNCTION');
  try {
    const token = await getVercelOidcToken();
    if (!token) return res.status(401).json({ ok: false, stage: 'TRUSTED_OIDC_MISSING' });

    const host = process.env.VERCEL_URL;
    if (!host) return res.status(400).json({ ok: false, stage: 'HOST_MISSING' });

    const target = `https://${host}/api/github-app-preflight-v2`;
    const r = await fetch(target, {
      method: 'POST',
      headers: {
        'x-vercel-trusted-oidc-idp-token': token,
        'content-type': 'application/json'
      }
    });

    const body = await r.text();
    let safe = {};
    try { const j = JSON.parse(body); safe = {gateway_http:j.gateway_http ?? null,gateway_code:j.gateway_code ?? 'UNKNOWN',upstream_layer:j.upstream_layer ?? 'UNKNOWN',child_oidc_obtained:j.oidc_obtained === true}; } catch (_) {}
    return res.status(r.status).json({ok:r.ok,layer:'FUNCTION',oidc_obtained:true,self_call_http:r.status,child_marker:r.headers.get('x-kiyusama-layer') === 'FUNCTION',...safe});
  } catch (e) {
    return res.status(500).json({ ok: false, stage: 'SELF_PREFLIGHT_RUNTIME', error: String(e && e.message || e) });
  }
};
