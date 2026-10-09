# PostgreSQL int8 cross-field boundary (2026-10-09)

Independent READ of latest guardian/postgres-reservation-proof.mjs:
- checkpoint_revision now uses bigint parsing for PostgreSQL int8 decimal strings.
- row.root_task_id still uses strict equality to expected.rootTaskId.
- checkpoint.fenceEpoch still uses strict equality to expected.fenceEpoch.

DB catalog confirms root_task_checkpoint_v1.root_task_id and checkpoint_revision are bigint, and root_task_checkpoint_save_fenced_v1.p_fence_epoch is bigint.

Potential integration mismatch (NOT a proven runtime bug):
- Database driver can represent bigint root_task_id as "123" while caller holds 123 (number).
- JSON checkpoint.fenceEpoch is caller-supplied; its serialization depends on the adapter, unlike SQL bigint.
- Thus the mapper must either receive canonical string representations for rootTaskId/fenceEpoch, or explicitly normalize them with strict safe-integer rules. Avoid permissive JS coercion.

Minimal safe contract:
1. rootTaskId: canonical decimal string across DB and caller, validated as a nonnegative bigint string.
2. expectedRevision and row.checkpoint_revision: safe bigint/decimal comparison (already implemented).
3. fenceEpoch: explicit JSON contract; preserve a canonical type across checkpoint writer and proof mapper.
4. Test decimal string vs number, >2^53, leading zeros, negative, exponent, null, and wrong fence.
5. Do not infer a valid SEND reservation from existing continuation checkpoints.

No code overwritten, no DB mutation, no external SEND. Need adapter's actual serialization before changing mapper behavior.
