# iPhone 15 Pro Max → PC-OFF personal SORA/KIRA: actual deployment decision (2026-10-09)

## Target
Existing personal ChatGPT SORA_03 and existing personal Claude.ai KIRA chats, PC OFF, iPhone as entrypoint. No replacement API agents, no new personal conversation.

## Independently checked current inventory
- Vercel list_projects(search=kiyusama) returns exactly one matching project: kiyusama-os-write-test (prj_h49c19VV45FseaB40P7QIJfEq01H). This is NOT evidence of a persistent Windows/Mac desktop or an Edge native host.
- Existing Browserless Python CDP connector at external_body_browserless_profile.py on branch sora/external-body-adapter-20260923; existing READ-ONLY external Claude.ai workflow at .github/workflows/external-body-adapter-dispatch.yml. This is the first reuse candidate, not a new cloud PC subscription.
- PC-ON Edge Bridge SORA single-turn confirmed 2026-10-09 07:40 JST; external personal Claude.ai SEND and PC-OFF SORA/KIRA wake are not proven.

## NOW→FUTURE→NOW→FUTURE
NOW 1: iPhone browser desktop mode changes presentation only; no Windows native host. Avoid telling user to buy a Mac or keep home PC ON.
FUTURE 1: A supported, authorized remote browser session (existing Browserless profile) may supply cloud browser hands. Verify authentication, exact existing Claude.ai conversation, session survival and product authorization before any SEND.
NOW 2: Guardian has fenced SEND/RETURN, keeper proof and post-reply executor liveness CI gates. These do not create a real remote browser session by themselves.
FUTURE 2: Connect same authorized browser runtime to existing ChatGPT SORA_03 conversation and external Claude.ai KIRA, then demonstrate iPhone request→SORA→KIRA→RESULT→NEXT with home PC OFF, one event ID and durable readback per step.

## Cost/security decision
Use existing READ-ONLY Browserless candidate for preflight first. Do not provision paid cloud PC, copy browser cookies, bypass authentication, enable unsafe auto-send, or touch production/main without evidence and authority. Cloud Windows is a fallback only if actual Windows-only native Bridge functionality proves indispensable and cloud browser CDP cannot satisfy the same-body requirements.

## Status
DESIGN/REUSE PATH DOCUMENTED, not PC-OFF WAKE PASS. No remote browser login, SEND, workflow dispatch, secret access, or paid resource creation performed.
