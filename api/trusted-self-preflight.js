module.exports = async function handler(req, res) {
  try {
    const token = process.env.VERCEL_OIDC_TOKEN;
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
    res.status(r.status);
    res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
    return res.send(body);
  } catch (e) {
    return res.status(500).json({ ok: false, stage: 'SELF_PREFLIGHT_RUNTIME', error: String(e && e.message || e) });
  }
};
