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
