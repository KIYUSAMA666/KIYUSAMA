# EGRESS PERMIT + CODEX-K AUDIT V1

## Egress permit chain
- issue_gateway_egress_permit_v0 calls gateway_worker_pre_network_fence_v0 before issuance.
- Permit TTL constrained to 1..60 seconds.
- Issuance revokes/expires prior ISSUED permit for same dispatch.
- consume_gateway_egress_permit_v0 requires ISSUED + unexpired + exact dispatch/worker/epoch binding.
- Consume rechecks RUNNING, worker epoch, generation across dispatch/task/execution/permit, authority validity, task state and side_effect_status=NONE.
- Permit becomes CONSUMED before receiver network mutation.

Verdict: pre-network fence and one-time permit binding are implemented live.

## Codex-K runner isolation
- Codex model step uses secretless OIDC proxy token, not GH_TOKEN.
- Protected .github/.codex paths are restored after Codex execution.
- GH_TOKEN is introduced only in deterministic branch-preparation shell step.
- Output branch namespace is codex-k/auto-*, not main.
- Main remains PR-gated by repository ruleset.

Verdict: CODEX-K model does not receive GitHub write token; branch output is reversible and main-gated.

## Remaining critical promotion invariant
After reservation, external target mutation + lost/failing finalize must enter UNKNOWN/HOLD reconciliation, not blind ABORT/retry. Cleanup implementation must distinguish pre-target-write failure from post-target-write uncertainty.
