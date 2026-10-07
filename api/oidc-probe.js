module.exports = async function handler(req, res) {
  const present = Boolean(req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN);
  return res.status(present ? 200 : 401).json({ ok: present, evidence: present ? 'VERCEL_OIDC_PRESENT' : 'VERCEL_OIDC_MISSING' });
};
