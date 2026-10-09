# Checkpoint shape contract — READ ONLY audit, 2026-10-09

Observed in common_memory.root_task_checkpoint_v1 (41 rows):
- checkpointId, checkpointRevision, continuationState, nextAction, workId: 41/41.
- lastAgentReply, lastMessageId: 40/41.
- proof: 1/41.
- leaseToken, sendStarted, fenceEpoch: 0/41.

These are existing continuation checkpoints, NOT demonstrated SEND reservation checkpoints.

DB function common_memory.root_task_checkpoint_save_fenced_v1:
- checks task owner, lease token, fence epoch, and lease expiry in task_root_control_v1;
- delegates to root_task_checkpoint_save_v1, which enforces checkpoint_revision CAS;
- persists the caller-supplied checkpoint JSON without validating SEND schema.

The isolated mapper mapReservationCheckpoint(row, expected) requires:
row.root_task_id, row.checkpoint_id, row.checkpoint_revision and JSON keys bodyId, workId, expectedUserTurnId, ownerId, leaseToken, fenceEpoch, state='SENDING', sendStarted=true, preSendCommitted=true, resultCommitted=false.

Decision:
- Existing 41 rows cannot be presented as successful SEND reservations.
- New schema's theoretical compatibility with DB row type is not proof of a real stored row.
- Need isolated, non-production fixture or authorized sandbox DB execution with a dedicated test root_task_id and lease to establish row-level integration.
- No production INSERT/UPDATE, no SEND, no migration, no claim of exactly-once.
