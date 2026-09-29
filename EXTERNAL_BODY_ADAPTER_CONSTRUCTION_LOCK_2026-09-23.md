# External Body Adapter — construction lock

Status: BRANCH-ONLY / NOT PROVEN / DO NOT MERGE

## Fixed goal
Wake and submit a NEW TURN to the exact existing consumer conversation identity used by KIYUSAMA, without a human sending the next message.

Success requires:
- exact existing conversation, not a new chat;
- existing authenticated consumer browser session;
- external trigger;
- durable payload before wake;
- automatic submit;
- response correlated to the same conversation head;
- no Managed Agent, API-only proxy, CLI session, or internal executor counted as the body identity;
- direct evidence before PASS.

## Locked world reference
The construction reference is the already-verified consumer-browser pattern recorded in OPEN ROOM Record 390, cross-checked against the world implementation used for an adopted private ChatGPT /c/ conversation:
1. adopt exact conversation URL/identity;
2. hold a conversation lease;
3. verify canonical URL/head before send;
4. inject and submit through the authenticated browser;
5. collect response and advance the same conversation;
6. on ambiguous send, reconcile read-only instead of blindly resending.

Records 379/388 remain the separate interactive CLI/tmux reference and MUST NOT be substituted for consumer web/app identity.

## HOME delta observed
Repository inspection did not find an existing consumer ChatGPT/Claude browser driver or conversation-lease component. OPEN ROOM and guarded execution infrastructure already exist. Therefore the missing role is the final external-body browser adapter.

## Construction rule
Do not invent a parallel OS. Reuse OPEN ROOM, existing auth/gates/audit, and add only the missing adapter role. No secrets in repository. No bypass of approval gates. No production deployment from this branch.

## First executable proof
Before implementation is considered complete, prove on a non-destructive test conversation:
OPEN ROOM event -> exact conversation ID -> authenticated browser -> auto-submit -> same conversation NEW TURN -> response correlation -> OPEN ROOM writeback.

Until that exact proof exists: NOT PROVEN.
