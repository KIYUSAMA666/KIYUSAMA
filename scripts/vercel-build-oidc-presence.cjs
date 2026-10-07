// Safe build-time presence check: never log token contents.
const present = typeof process.env.VERCEL_OIDC_TOKEN === 'string' && process.env.VERCEL_OIDC_TOKEN.length > 0;
console.log('KIYUSAMA_BUILD_OIDC_PRESENT=' + (present ? 'yes' : 'no'));
console.log('KIYUSAMA_BUILD_ENV=' + (process.env.VERCEL_ENV || 'NOT_SET'));
console.log('KIYUSAMA_BUILD_PROJECT_ID_PRESENT=' + (process.env.VERCEL_PROJECT_ID ? 'yes' : 'no'));

// One safe same-project Preview trust probe; never print token or response body.
(async () => {
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token) { console.log('KIYUSAMA_TRUST_HTTP=SKIPPED_NO_OIDC'); return; }
  const url = 'https://kiyusama-os-write-test-496hj8dih-masa1234k-2475s-projects.vercel.app/api/oidc-probe';
  try {
    const response = await fetch(url, {method:'GET',redirect:'manual',headers:{'x-vercel-trusted-oidc-idp-token':token},signal:AbortSignal.timeout(10000)});
    const body = await response.text();
    const marker = body.includes('VERCEL_OIDC_PRESENT') ? 'VERCEL_OIDC_PRESENT' : body.includes('VERCEL_OIDC_MISSING') ? 'VERCEL_OIDC_MISSING' : 'NOT_FUNCTION_MARKER';
    console.log('KIYUSAMA_TRUST_HTTP=' + response.status);
    console.log('KIYUSAMA_TRUST_MARKER=' + marker);
  } catch(e) { console.log('KIYUSAMA_TRUST_HTTP=NETWORK_ERROR'); }
})();


// Isolated Preview-to-Preview preflight probe. Never log tokens or response bodies.
(async () => {
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token || process.env.VERCEL_ENV !== 'preview') {
    console.log('KIYUSAMA_PREFLIGHT=SKIPPED');
    return;
  }
  const origin = 'https://kiyusama-os-write-test-alkdqrkh0-masa1234k-2475s-projects.vercel.app';
  for (const path of ['/api/oidc-probe', '/api/trusted-self-preflight', '/api/github-app-preflight-v2']) {
    try {
      const r = await fetch(origin + path, {
        method: 'GET', redirect: 'manual',
        headers: {'x-vercel-trusted-oidc-idp-token': token},
        signal: AbortSignal.timeout(10000)
      });
      const raw = await r.text();
      let stage = 'NON_JSON';
      try { const parsed = JSON.parse(raw); stage = typeof parsed.stage === 'string' && /^[A-Z0-9_]{1,70}$/.test(parsed.stage) ? parsed.stage : 'NO_SAFE_STAGE'; console.log('KIYUSAMA_SAFE_DIAG=' + path + ' parent_oidc=' + (parsed.oidc_obtained === true) + ' child_oidc=' + (parsed.child_oidc_obtained === true) + ' gateway_http=' + (Number.isInteger(parsed.gateway_http) ? parsed.gateway_http : 'NA') + ' gateway_code=' + (/^[A-Za-z0-9_-]{1,70}$/.test(parsed.gateway_code || '') ? parsed.gateway_code : 'UNKNOWN')); } catch (_) {}
      console.log('KIYUSAMA_PREFLIGHT_PATH=' + path + ' HTTP=' + r.status + ' STAGE=' + stage + ' CRYPTO=' + (r.headers.get('x-kiyusama-crypto-check') || 'NA') + ' CLAIM_MISMATCH=' + (r.headers.get('x-kiyusama-claim-check') || 'NA') + ' FUNCTION_MARKER=' + (r.headers.get('x-kiyusama-layer') === 'FUNCTION') + ' LOCATION_HOST=' +
        (r.headers.get('location') ? new URL(r.headers.get('location'), origin).host : 'NONE'));
    } catch (_) {
      console.log('KIYUSAMA_PREFLIGHT_PATH=' + path + ' HTTP=NETWORK_ERROR');
    }
  }
})();
