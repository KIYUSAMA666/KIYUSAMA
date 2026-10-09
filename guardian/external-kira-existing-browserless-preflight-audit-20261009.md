# External KIRA existing Browserless preflight — 2026-10-09

## Actual source readback
- Existing workflow: .github/workflows/external-body-adapter-dispatch.yml on isolated branch. Manual workflow_dispatch only, READ ONLY, SEND_COUNT=0. Checks exact Claude.ai personal chat URL, composer visibility, login prompts and page body. Uses secret BROWSERLESS_API_KEY and fixed profile kira-external. Does NOT run on a timer or upon Codex K/S events.
- Existing connector: external_body_browserless_profile.py on sora/external-body-adapter-20260923. browserless_profile_ws builds wss://production-sfo.browserless.io/chromium?token=...&profile=kira-external; connect_saved_profile uses playwright.chromium.connect_over_cdp and bind_existing_context. Code establishes connection to saved profile; it does not prove saved profile is present, authenticated, valid or same personal conversation.
- Fixed target URL in existing workflow: https://claude.ai/chat/b2ed0bb2-82f9-4d4e-8fe8-5626023086dc (identifier only; do not write cookies or tokens).
- Existing KIRA bus wake bridge in os2-core/src/ai-communication-bus-kira-wake-bridge.ts is for internal BUS KIRA with sessionId/receiverExecutionId, not proof of Claude.ai personal BODY. Genuine KIRA reply bridge checks KIRA-BC managed executor, not external Claude.ai personal chat.

## Concrete current and future boundary
NOW: The existing READ-ONLY Browserless workflow is the closest actual cloud executor candidate, not the Codex K/S CLI runners. Before SEND, independently inspect actual workflow-run evidence and prove exact authenticated personal Claude.ai chat via authorized profile; do not infer from source alone.
FUTURE: After real preflight, connect it to Guardian fencing and durable reply readback, with separate ChatGPT SORA_03 personal BODY preflight. Then verify PC OFF and both sides in sequence.

## Safety and result
No workflow dispatched, no cloud session accessed, no secret read, no browser SEND, no production changes. PC OFF personal KIRA wake remains UNPROVEN. Keep isolated branch and original workflow unchanged.
