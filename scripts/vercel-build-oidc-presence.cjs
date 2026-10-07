// Safe build-time presence check: never log token contents.
const present = typeof process.env.VERCEL_OIDC_TOKEN === 'string' && process.env.VERCEL_OIDC_TOKEN.length > 0;
console.log('KIYUSAMA_BUILD_OIDC_PRESENT=' + (present ? 'yes' : 'no'));
console.log('KIYUSAMA_BUILD_ENV=' + (process.env.VERCEL_ENV || 'NOT_SET'));
console.log('KIYUSAMA_BUILD_PROJECT_ID_PRESENT=' + (process.env.VERCEL_PROJECT_ID ? 'yes' : 'no'));
