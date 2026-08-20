# KIYUSAMA OS — CARROT TRIGGER

Date: 2026-08-21
Status: PRE-BILLING DESIGN / READY FOR TEST

## Purpose
Build the parts that do not require OpenAI API billing before the Zapier Retest.

## Core idea
CARROT TRIGGER does not send an execution command. It presents information (the carrot). Once an AI execution path is activated, the AI reads the carrot, compares it with relevant memory, judges its value, and decides what to do within its authority.

## Two-layer architecture

### Layer 1 — WAKE / TRIGGER
External mechanism that activates an execution path.
Examples: Gmail event, Zapier event, scheduler.
This layer remains technically separate from CARROT judgment.

### Layer 2 — CARROT / JUDGMENT
Input is information, not an imperative.
Flow:
1. SEE — receive/read the information.
2. RETRIEVE — retrieve only relevant COMMON MEMORY.
3. COMPARE — compare new information with known facts/current tasks.
4. VALUE — judge whether action has value.
5. ROLE — respond according to AI role.
6. AUTHORITY — classify proposed action GREEN/YELLOW/RED.
7. ACT or HOLD — execute only if permitted; otherwise hold/escalate.
8. RECORD — write decision, evidence, result, and next state.

## Role behavior
- SORA: asks "Is this worth advancing, and how?"
- KIRA: asks "Is this correct, evidenced, and safe to advance?"
- Same carrot may produce different judgments by role.

## Authority gate
### GREEN — autonomous
Read, search, compare, analyze, classify, summarize, draft, audit, propose next steps. No external irreversible action.

### YELLOW — gated
External messages, DB writes that alter operational state, non-public configuration changes, or actions with meaningful side effects. Require defined AI cross-check and/or explicit rule before execution.

### RED — KIYUSAMA approval required
Payments, purchases, contracts, deletion, public release/publishing, credential/permission changes, destructive actions, or other high-impact irreversible actions.

## Minimal CARROT payload
- carrot_id
- created_at
- source
- subject
- information
- evidence_reference
- urgency
- related_project
- suggested_memory_scope
- status: NEW / SEEN / JUDGED / ACTED / HELD

Important: `information` should describe what happened; it should not contain an imperative command.

## First test after billing
Existing path must NOT be rebuilt.
1. Complete OpenAI API billing setup.
2. Open existing Zapier step `2. Conversation`.
3. Test -> Retest step.
4. Use Gmail subject `[SORA-KIRA AUTO TEST]`.
5. Confirm Gmail -> Zapier -> OpenAI one-round-trip evidence.
6. Mark PASS only after real evidence exists.

## CARROT TEST 01
After the existing Zapier path passes:
- Deliver one harmless information-only carrot.
- Do not say "execute", "send", "change", or "publish".
- Expected SORA result: SEE -> RETRIEVE -> COMPARE -> VALUE -> authority classification -> proposed response.
- Expected KIRA result (when an external KIRA execution path is available): SEE -> RETRIEVE -> VERIFY -> authority classification -> PASS/HOLD with reason.
- GREEN only. No external write, payment, publication, deletion, or permission change.

## PASS criteria
CARROT TEST 01 passes only when evidence shows:
1. A carrot was delivered.
2. The execution path actually read it.
3. Relevant memory/context was retrieved or explicitly scoped.
4. The AI made a value judgment rather than blindly executing text.
5. The action was classified by authority.
6. The result/decision was recorded.

## Known current constraints
- OpenAI billing is currently blocking the existing Zapier Conversation Retest.
- Zapier -> OpenAI PASS does not prove KIRA external wake/trigger PASS.
- KIRA external execution wake path remains a separate test.
- Do not claim KIRA_MAIN itself was awakened unless directly evidenced.

## Current next state
READY_BEFORE_PAYMENT = design prepared.
BLOCKED_FOR_EXECUTION = OpenAI billing / Retest pending.
NEXT_AFTER_PAYMENT = Retest existing Zapier flow; do not rebuild from zero.
