-- ISOLATED PROPOSAL ONLY. Do not deploy without sandbox tests and privilege review.
-- Guardian SEND_STARTED reservation, single PostgreSQL transaction.
create or replace function common_memory.guardian_send_reserve_v1(
 p_root_task_id bigint, p_expected_revision bigint, p_checkpoint_id uuid,
 p_body_id text, p_work_id text, p_expected_user_turn_id text,
 p_owner_id text, p_lease_token uuid, p_fence_epoch bigint
) returns common_memory.root_task_checkpoint_v1
language plpgsql security definer
set search_path = common_memory, pg_catalog, extensions
as $$
declare
 ctl common_memory.task_root_control_v1%rowtype;
 prev common_memory.root_task_checkpoint_v1%rowtype;
 saved common_memory.root_task_checkpoint_v1%rowtype;
begin
 if p_root_task_id is null or p_checkpoint_id is null or p_lease_token is null
    or p_expected_revision is null or p_expected_revision < 1
    or p_fence_epoch is null or p_fence_epoch < 1
    or nullif(btrim(p_body_id),'') is null
    or nullif(btrim(p_work_id),'') is null
    or nullif(btrim(p_expected_user_turn_id),'') is null
    or nullif(btrim(p_owner_id),'') is null
 then raise exception 'GUARDIAN_COORDINATE_REQUIRED'; end if;
 select * into ctl from common_memory.task_root_control_v1
  where root_task_id=p_root_task_id for update;
 if not found or ctl.stopped_at is not null or
    ctl.owner_id is distinct from p_owner_id or
    ctl.lease_token is distinct from p_lease_token or
    ctl.fence_epoch is distinct from p_fence_epoch or
    ctl.lease_expires_at is null or ctl.lease_expires_at <= clock_timestamp()
 then raise exception 'GUARDIAN_FENCE_REJECT'; end if;
 -- Same lock order as fenced checkpoint: row first, then checkpoint advisory lock.
 perform pg_advisory_xact_lock(hashtextextended('ROOT_TASK_CHECKPOINT:'||p_root_task_id::text,0));
 select * into prev from common_memory.root_task_checkpoint_v1
  where root_task_id=p_root_task_id order by checkpoint_revision desc limit 1;
 if not found or prev.checkpoint_revision <> p_expected_revision
 then raise exception 'GUARDIAN_REVISION_REJECT'; end if;
 if prev.checkpoint->>'bodyId' is distinct from p_body_id
    or prev.checkpoint->>'workId' is distinct from p_work_id
    or prev.checkpoint->>'expectedUserTurnId' is distinct from p_expected_user_turn_id
    or prev.checkpoint->>'ownerId' is distinct from p_owner_id
    or prev.checkpoint->>'state' is distinct from 'LOCKED'
    or prev.checkpoint->>'preSendCommitted' is distinct from 'true'
    or prev.checkpoint->>'sendStarted' is distinct from 'false'
 then raise exception 'GUARDIAN_PRE_SEND_REJECT'; end if;
 saved := common_memory.root_task_checkpoint_save_fenced_v1(
   p_root_task_id,p_expected_revision,p_checkpoint_id,
   prev.checkpoint || jsonb_build_object('state','SENDING','sendStarted',true,'resultCommitted',false),
   p_owner_id,p_lease_token,p_fence_epoch,
   jsonb_build_object('source','guardian_send_reserve_v1','previous_checkpoint_id',prev.checkpoint_id)
 );
 return saved;
end $$;
-- No GRANT EXECUTE: privilege policy must be reviewed before deployment.
