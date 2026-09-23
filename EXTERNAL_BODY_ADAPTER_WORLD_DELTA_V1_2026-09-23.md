# External Body Adapter — World Construction Delta v1

Date: 2026-09-23
Branch-only. NOT PROVEN. Do not merge/deploy.

## World object locked
Reference implementation: xicv/ego-chat + Ego Lite browser transport.

Verified construction properties:
- exact private ChatGPT canonical /c/ conversation is adopted and persisted as a binding;
- authenticated browser login state is reused;
- binding owns exact task-space/tab/conversation identity, never "newest tab";
- conversation lease prevents concurrent interleaving;
- canonical URL + stable conversation-head fingerprint are revalidated before Send;
- outbound payload has unique operation identity/marker;
- durable state records send_confirmed before response capture;
- after an ambiguous/confirmed Send, capture is read-only and Send is never blindly repeated;
- response is attributed to the same bound conversation and workflow;
- broker survives client/facade interruption and resumes capture;
- human login/CAPTCHA remains a fail-closed boundary;
- no cookie/credential extraction is part of the design.

World limitation that HOME must preserve honestly:
browser UI cannot provide a true remote exactly-once transaction; the reference therefore implements fail-closed, effectively-at-most-once submission plus reconciliation.

## HOME comparison
Already present:
- OPEN ROOM durable task/evidence plane;
- guarded internal executors;
- identity/audit/approval concepts;
- GitHub/Supabase/Codex lanes.

Missing role observed in repository:
- consumer ChatGPT authenticated-browser transport;
- exact canonical conversation binding/lease;
- browser-side head fingerprint and pre-send revalidation;
- send-confirmation/reconciliation state machine;
- same-conversation response attribution/writeback.

## Minimal build order
1. Define body-conversation binding record: provider, canonical conversation identity, opaque browser-space/tab identity, observed head fingerprint, lease/fencing revision. Never store login cookies/secrets in repo/OPEN ROOM.
2. Define operation ledger: OPEN ROOM event id, target binding, payload digest, unique marker, state PREPARED/SEND_CONFIRMED/CAPTURED/RECONCILE/HUMAN_REQUIRED/FAILED.
3. Browser adapter must reuse authenticated user session, open exact canonical conversation, verify binding/head, inject payload, verify composer digest, click Send once.
4. Persist SEND_CONFIRMED before any response wait.
5. Capture only read-only after confirmed/ambiguous Send; never blind resend.
6. Attribute stable assistant tail to exact prior head + operation marker; advance head.
7. Write correlated result back to OPEN ROOM.
8. First proof uses a non-destructive test conversation. PASS only when exact existing external/body conversation performs the NEW TURN without a human sending the next message.

## No substitutions
Managed Agents, API chat, new ChatGPT chat, CLI/tmux identity, internal SORA/KIRA, or a proxy conversation do not satisfy body PASS.
