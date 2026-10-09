# WORLD CHECK — external SEND boundary (2026-10-09)

Status: RESEARCH ONLY. No production authorization; no SEND.

## Independent reference implementations
- https://github.com/tensorzero/durable — durable step checkpointing; use stable task/step idempotency keys at the downstream effect boundary.
- https://github.com/osbytes/txob — PostgreSQL transactional outbox, at-least-once relay, downstream idempotency. Crash after effect but before ACK can redeliver.
- https://github.com/faustbrian/go-transactional-outbox — lease-token-guarded PostgreSQL claims and at-least-once publisher.
- https://github.com/czeresniowski-dev/pg-outbox — executable demonstration: sink accepted but publisher crashed before marking sent; event delivered twice on retry.

## KIYUSAMA boundary
Existing DB function root_task_checkpoint_save_fenced_v1 validates lease owner/token/fence/expiry; root_task_checkpoint_save_v1 validates revision CAS. The JSON payload itself is caller-supplied.
Existing Guardian mapReservationCheckpoint verifies the returned row/JSON shape; it is not downstream acceptance proof.
Existing Guardian externalResultAttempted=true before effect prevents blind retry but can HOLD even if no effect occurred.
No proof that the consumer ChatGPT/Claude conversation SEND endpoint supports stable idempotency keys or authoritative query-by-operation-key.

## Safe decision table
1. DB reservation rejected -> no SEND.
2. DB reservation confirmed, effect not attempted -> may execute once under valid owner/fence.
3. Effect attempted, no downstream receipt -> UNKNOWN_HOLD; never blind retry.
4. Downstream receipt tied to immutable operation key -> ACK/complete; do not SEND again.
5. Downstream definitive not-accepted evidence + fresh lease/fence -> reconsider safe retry, only with validated external contract.

## First unproven
Verify external destination supports (a) idempotency-key enforcement OR (b) authoritative receipt lookup by immutable operation key. Without one of these, DB CAS and fencing cannot establish exactly-once external SEND.

Sources are independent implementation references, not claims of production PASS.
