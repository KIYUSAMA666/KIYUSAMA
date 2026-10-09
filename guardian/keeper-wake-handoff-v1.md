# KEEPER WAKE HANDOFF v1 — isolated invention, NOT production

## Source inspiration (read directly)
Miller-Family-Projects/heartbeat-hermes, heartbeat_hermes/plugin.py _inject_wake(): builds an internal MessageEvent with SessionSource(chat_id, thread_id), calls the captured GatewayRunner._handle_message(event), then routes response through an adapter. Its gateway is Hermes, **not** an existing personal ChatGPT or Claude.ai session.

## New KIYUSAMA synthesis: KEEPER as durable pending-work owner
Instead of building a new SORA/KIRA agent, create an **out-of-band Keeper** that observes existing Slack/Gmail/CENTRAL NERVE deltas, claims exactly one event, and attempts to hand it to the existing BODY through a separately proven, authorized entry point.

States: DETECTED -> CLAIMED -> WAKE_REQUESTED -> BODY_CONFIRMED -> WORKING -> RESULT_VERIFIED -> NEXT_READY.
Failures: WAKE_UNAVAILABLE -> PENDING (do not fabricate BODY wake); SEND_AMBIGUOUS -> UNCERTAIN (no automatic resend); AUTH_REQUIRED -> HUMAN_REQUIRED (no credential bypass).

Each event must carry event_id, source, source_message_id, target_actor (SORA_03 or external KIRA), canonical conversation locator, lineage, expected previous turn, lease owner/fence epoch, expiry, and causal parent event_id. These are **coordinates**, not proof of identity.

### Split proof gates
G0: source event observed with provenance; G1: Keeper claimed event via durable CAS; G2: target entry point exists and is authorized; G3: **same existing target BODY** actually accepted a wake/turn; G4: resulting WORK verified; G5: result acknowledged and one successor event committed.
Only G3 proves real wake; notification, Codex execution, Github Actions and queued work cannot substitute.

### Novel dual-lane rule
K-lane and S-lane share event semantics, but their target adapters remain separate. One lane PASS never upgrades the other. A result from internal KIRA never impersonates external Claude KIRA. Do not mint new ChatGPT/Claude identities or proxy threads.

### Anti-loop rule
No recursive dispatch from an unverified result. Keeper may produce NEXT_READY only after G4+G5, under an iteration budget, cooldown, stop switch and human authority limits. On uncertainty park work, do not repeat SEND.

### Minimal proof plan
1. Read existing K/S lane contracts and distinguish actual executor from proposed labels.
2. Dry-run DETECTED -> CLAIMED -> PENDING with synthetic event; SEND=0.
3. Only after target adapter G2 exists, attempt a single opt-in authorized BODY wake and readback; prove exact canonical conversation ID.
4. Keep PC OFF throughout cloud proof; no local token extraction or bypass.

## Status 2026-10-09
Public Hermes wake code inspected. This design recorded only. No deployed Keeper, no G2/G3 PASS, no PC-OFF same-body SEND. Main and production DB unchanged.
