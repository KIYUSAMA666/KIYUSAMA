# TONTON PAPER PLANE — 2026-08-31

Status: CODE WIRED / DEPLOYED / EXTERNAL POST BLOCKED BY VERCEL DEPLOYMENT PROTECTION

## Implemented

- iPhone Back Tap candidate -> Shortcuts HTTP POST ingress
- `api/tonton-paper-plane.js`
- TONTON signal normalization
- TONTON_WAKE handoff
- OS_RUNNER_REQUEST mapping
- backend-neutral TaskSource -> Executor -> ResultSink seam
- paper-plane NOOP executor
- KIYUSAMA OS paper-plane receipt
- ACK is emitted only when the full local OS contract reaches `stage=complete` with a receipt

## Deployment evidence

- branch: `sora/tonton-paper-plane-20260831`
- commit: `aad9ae6c8497d0d658edbe75d0c06edc780bd01e`
- Vercel deployment: `dpl_Nt9j3ruzXwAaKfHMxUoVEoNVWeMR`
- deployment state: READY

## Remaining blocker

The preview deployment is protected by Vercel Authentication / Deployment Protection. An unauthenticated Shortcuts POST cannot yet be treated as proven.

Do not mark Physical-device PASS until one real iPhone Back Tap -> Shortcuts POST -> HTTPS -> TONTON_WAKE -> OS_RUNNER_REQUEST -> receipt -> ACK round trip is evidenced in logs.

## Strict verdict

- CODE_WIRED: PASS
- DEPLOYMENT_READY: PASS
- EXTERNAL_UNAUTHENTICATED_POST: BLOCKED
- PHYSICAL_DEVICE_PASS: NOT CONFIRMED
