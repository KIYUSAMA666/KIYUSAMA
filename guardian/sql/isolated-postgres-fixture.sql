-- Run ONLY against ephemeral PostgreSQL in CI.
create schema common_memory;
create extension if not exists pgcrypto;
create table common_memory.task_root_control_v1 (
 root_task_id bigint primary key, stopped_at timestamptz,
 owner_id text, lease_token uuid, fence_epoch bigint not null,
 lease_expires_at timestamptz
);
create table common_memory.root_task_checkpoint_v1 (
 root_task_id bigint not null, checkpoint_id uuid not null,
 parent_checkpoint_id uuid, checkpoint_revision bigint not null,
 checkpoint jsonb not null, metadata jsonb, created_at timestamptz default now(),
 primary key(root_task_id,checkpoint_id), unique(root_task_id,checkpoint_revision)
);
create function common_memory.root_task_checkpoint_save_fenced_v1(
 p_root_task_id bigint,p_expected_revision bigint,p_checkpoint_id uuid,p_checkpoint jsonb,
 p_owner_id text,p_lease_token uuid,p_fence_epoch bigint,p_metadata jsonb default null
) returns common_memory.root_task_checkpoint_v1 language plpgsql as $$
declare ctl common_memory.task_root_control_v1%rowtype; prev common_memory.root_task_checkpoint_v1%rowtype;
 outrow common_memory.root_task_checkpoint_v1%rowtype;
begin
 select * into ctl from common_memory.task_root_control_v1 where root_task_id=p_root_task_id for update;
 if not found or ctl.owner_id is distinct from p_owner_id or ctl.lease_token is distinct from p_lease_token
 or ctl.fence_epoch is distinct from p_fence_epoch or ctl.lease_expires_at<=clock_timestamp()
 then raise exception 'STALE_WORKER_FENCE_REJECT'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ROOT_TASK_CHECKPOINT:'||p_root_task_id::text,0));
 select * into prev from common_memory.root_task_checkpoint_v1 where root_task_id=p_root_task_id
 order by checkpoint_revision desc limit 1;
 if not found or prev.checkpoint_revision<>p_expected_revision then raise exception 'CHECKPOINT CAS REJECT'; end if;
 insert into common_memory.root_task_checkpoint_v1(root_task_id,checkpoint_id,parent_checkpoint_id,checkpoint_revision,checkpoint,metadata)
 values(p_root_task_id,p_checkpoint_id,prev.checkpoint_id,p_expected_revision+1,p_checkpoint,p_metadata)
 returning * into outrow;
 return outrow;
end $$;
insert into common_memory.task_root_control_v1 values(900001,null,'ci-owner','11111111-1111-4111-8111-111111111111',3,clock_timestamp()+interval '30 minutes');
insert into common_memory.root_task_checkpoint_v1(root_task_id,checkpoint_id,checkpoint_revision,checkpoint)
values(900001,'22222222-2222-4222-8222-222222222222',1,
'{"bodyId":"SORA_03","workId":"ci-work","expectedUserTurnId":"ci-turn","ownerId":"ci-owner","leaseToken":"11111111-1111-4111-8111-111111111111","fenceEpoch":3,"state":"LOCKED","preSendCommitted":true,"sendStarted":false,"resultCommitted":false}');
