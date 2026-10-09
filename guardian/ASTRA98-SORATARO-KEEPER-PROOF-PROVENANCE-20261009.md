# 援護ソラ太郎 — Keeper proof provenance independent finding (2026-10-09)

ACTUAL READ on ACE branch sora/guardian-return-isolated-check-20261009:
- guardian/keeper-wake-proof-gate.mjs
- guardian/keeper-wake-proof-gate.test.mjs
- guardian/keeper-event-machine.mjs
- guardian/keeper-event-machine.test.mjs
- guardian/keeper-wake-adapter.mjs: NOT_FOUND at inspected path.
GitHub default-branch code search for evaluateKeeperWake returned no results; it does not index this isolated branch, so absence of a caller across branch is NOT proven.

CURRENT:
The successful proof-gate test supplies an observation object with authenticated:true, sameExistingBody:true, acceptedCausalTurnId and assistant turn id. The evaluator checks field agreement but does not establish observation origin. State-machine CONFIRM_BODY accepts any matching object with status WAKE_VERIFIED; no source-bound attestation in that pure function.

FUTURE:
A caller that fabricates or trusts unverified booleans can mark BODY_CONFIRMED despite no real original ChatGPT/Claude.ai turn. A passing unit test proves predicate logic only, not live wake.

CURRENT minimal independent evidence:
1. Find actual caller/producer of evaluateKeeperWake on ACE branch using branch tree/code inspection; do not assume it is absent.
2. Inspect trusted host adapter and original conversation readback proof.
3. Bind event id, conversation id, causal turn, assistant turn and provenance to an independently verifiable observation.
4. If producer is missing, mark PRODUCER_UNPROVEN and block promotion to original-body PASS.
5. Verify GitHub Actions K/S real run logs separately; workflow YAML is not execution proof.

FUTURE guard:
Fail closed on forged/stale proof, never self-certify sameExistingBody, no permission bypass. Original consumer chat and CLI worker remain distinct identities.

Status: TEST SOURCE READ PASS; proof origin and PC-OFF original-body wake UNPROVEN. No live SEND, production or main mutations.
