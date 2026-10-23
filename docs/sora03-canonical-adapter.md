# Canonical SORA03 continuation adapter: preflight implementation

This change prepares the existing heartbeat to distinguish SORA_03 from internal actors. PR #176's exclusion of SORA_03 and processed work in the Ollama executor remains intact. It does not restore a stopped workflow or send a ChatGPT message.

The canonical job uses the existing GitHub OIDC audience `kiyusama-open-room`, repository `KIYUSAMA666/KIYUSAMA`, and protected `main` ref. Database credentials remain in the existing Edge Function. No Supabase key is copied to the PC, no new database/CURRENT/ACK is created, and KIRA is outside this route.

## Current deployment boundary

The workflow is **preflight only**. It requires an interactive Windows self-hosted runner labelled `sora03-canonical`. No such runner has been verified or installed. The adapter must not use a Windows service session that cannot access the user's existing Edge session.

The deployed Browser Bridge read contract has not established role-isolated assistant responses and completion identity. A full-text page read cannot by itself establish an authoritative BODY RESULT. Live delivery must fail closed until that capability is verified; an injected test reader is not runtime evidence. The existing public gateway also lacks independent thought-body/cursor readback. A commit response alone is not a complete verification cycle.

The initial workflow runs `--plan`, not live delivery. Merging this change must not be described as Patrol A or unattended Patrol B success. The heartbeat's own workflow-file push trigger is removed so that merging a stopped-loop repair does not restart it. The existing mission-file trigger is unchanged. Initial activation requires a separate explicit operational decision after the missing capabilities have been established.

Canonical dispatch is additionally gated by the repository variable `SORA03_CANONICAL_ADAPTER_READY`, whose absent/default value is OFF. This change does not set that variable. Keep it OFF while the job is preflight-only, the runner is unverified, or live capabilities are missing; it must not accumulate queued jobs for an uninstalled runner. Other actors retain the existing canary route and PR #176 exclusions.

## Live promotion requirements

1. Confirm the canonical conversation ID `6abcca6d-9c2c-83ee-8c8a-d39b13be9134`, the existing installed Bridge hash, interactive runner ownership, and the current workflow control state.
2. Confirm the exact deployed read protocol can distinguish the completed assistant response from the user request. Do not change or relabel the closed Bridge repair to fake this proof.
3. Reconcile eligible fresh work against the authoritative ACK and prior delivery evidence. A new patrol or a completion-report entry alone must not create an endless feedback loop.
4. Prevent another adapter from sending the same coordinate. Persist SEND intent before the effect; uncertain SEND becomes recovery-only, never an automatic retry. Local delivery evidence is not a second ACK or memory database.
5. Verify the actual BODY RESULT coordinate, existing commit response, independent thought-body/cursor readback, then processed status. If the latest patrol changes during readback, preserve the coordinate and stop rather than claiming verification of a different patrol.
6. Prove fresh Patrol A end to end and fresh Patrol B without another human GO. A single manually supervised cycle does not prove unattended continuity.

Tests exercise local protocol/state invariants with injected transports. They do not operate the user's browser, bypass safety review, establish runner availability, or prove live unattended execution.
