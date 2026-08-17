export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    issuer: 'https://kiyusama-os-write-test.vercel.app',
    authorization_endpoint: 'https://zdypjilutgxjsneultqj.supabase.co/functions/v1/kira-main-mailbox-mcp-v1/authorize',
    token_endpoint: 'https://zdypjilutgxjsneultqj.supabase.co/functions/v1/kira-main-mailbox-mcp-v1/token',
    scopes_supported: ['mailbox.read'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post']
  });
}
