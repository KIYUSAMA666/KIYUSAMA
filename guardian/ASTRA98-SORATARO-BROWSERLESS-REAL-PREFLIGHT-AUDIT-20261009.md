# SORATARO — existing cloud Browserless route actual audit (2026-10-09)

## READ EVIDENCE
- MAIN contains .github/workflows/external-body-adapter-dispatch.yml; manual workflow_dispatch, read-only, 3-minute timeout, BROWSERLESS_API_KEY secret. This was fetched independently from main.
- Workflow checks out branch sora/external-body-adapter-20260923, imports external_body_browserless_profile.py, connects to production-sfo.browserless.io with saved profile kira-external and targets exact existing external KIRA Claude.ai chat.
- The connector source was fetched independently: browserless_profile_ws generates wss://production-sfo.browserless.io/chromium with token/profile; connect_saved_profile uses playwright.chromium.connect_over_cdp, then bind_existing_context. It does not send.
- Existing workflow performs goto and checks exact URL, composer visibility, login/password indicators; no SEND.
- GitHub Actions recent 100 runs query showed no external-body-adapter-dispatch match. This is NOT evidence of no historical runs.
- Remote Desktop Commander showed DESKTOP-KOR4LKD Offline at check time. Offline != physically powered off.

## FIRST UNPROVEN
Actually execute READ-ONLY authorized Browserless preflight and inspect authenticated same-external-KIRA conversation + composer. A source file, configured secret name and profile selector do not prove live credentials, saved login or successful page access. Then separately verify original ChatGPT SORA cloud access. Neither equals an authorized automatic SEND.

## SECURITY FINDING
Existing workflow prints BODY_PREFIX of first 1200 chars of Claude.ai page body into GitHub Actions logs. If authenticated, this may disclose personal conversation text to workflow log readers. Recommend removing BODY_PREFIX, retaining only minimal boolean status and sanitized failure codes before any dispatch. Never print browser WebSocket URL, token, cookies or session storage. Do not alter main automatically.

## DECISION
Reuse existing Browserless before paid cloud Windows. No cloud PC purchase, no browser cookie extraction, no main changes, no workflow dispatch or live SEND in this audit. Original SORA and external KIRA PC-OFF full cycle UNPROVEN.
