# SORA INFINITE MISSION v1

## GOAL
Prove a human-GO-free mission loop: a fixed mission can be resumed automatically until an explicit completion or genuine human-only boundary is reached.

## LOOP CONTRACT
1. READ current evidence/state.
2. THINK and choose the next smallest safe step.
3. ACT within the lane's permissions.
4. VERIFY the result.
5. If incomplete, return CONTINUE; the next heartbeat resumes automatically.
6. Stop only on COMPLETE or HUMAN_REQUIRED.

## GUARDS
- Existing CODEX-S / CODEX-K and KIRA production lanes are immutable from this experiment.
- No secrets, browser session cookies, credentials, or auth state may be committed or logged.
- No replacement identity may be called the same existing ChatGPT person.
- No fabricated PASS.
- Human approval is not requested for ordinary failures; failures become the next investigation coordinate.

## V1 SUCCESS
At least two independent scheduled heartbeats execute this lane without a human GO and preserve the fixed GOAL/guards.

## STATUS
BOOTSTRAP
