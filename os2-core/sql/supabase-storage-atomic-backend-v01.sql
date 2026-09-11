-- KIYUSAMA OS 2.0
-- SUPABASE / POSTGRES STORAGE ATOMIC BACKEND v0.1
--
-- This backend realizes StorageAtomicCommitCommand as one PostgreSQL function call.
-- The function takes one row lock on CURRENT and performs CAS + result consumption +
-- handoff consumption + CURRENT replacement inside the same database transaction.
-- Any exception aborts the function statement, so none of those effects may survive alone.

create schema if not exists os2_storage_v01;

revoke all on schema os2_storage_v01 from public;
revoke all on schema os2_storage_v01 from anon;
revoke all on schema os2_storage_v01 from authenticated;
grant usage on schema os2_storage_v01 to service_role;

create table if not exists os2_storage_v01.current_state (
  singleton_id boolean primary key default true check (singleton_id),
  state_id text not null check (length(btrim(state_id)) > 0),
  revision bigint not null check (revision >= 1),
  current_payload jsonb not null,
  commit_sequence bigint not null default 0 check (commit_sequence >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists os2_storage_v01.consumed_results (
  result_id text primary key check (length(btrim(result_id)) > 0),
  handoff_id text not null check (length(btrim(handoff_id)) > 0),
  consumed_at timestamptz not null default now()
);

create table if not exists os2_storage_v01.consumed_handoffs (
  handoff_id text primary key check (length(btrim(handoff_id)) > 0),
  result_id text not null check (length(btrim(result_id)) > 0),
  consumed_at timestamptz not null default now()
);

revoke all on all tables in schema os2_storage_v01 from public, anon, authenticated;
grant select, insert, update on os2_storage_v01.current_state to service_role;
grant select, insert on os2_storage_v01.consumed_results to service_role;
grant select, insert on os2_storage_v01.consumed_handoffs to service_role;

create or replace function os2_storage_v01.compare_consume_and_swap(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, os2_storage_v01
as $$
declare
  v_expected_state_id text := nullif(btrim(p_command->>'expectedCurrentStateId'), '');
  v_expected_revision bigint;
  v_result_id text := nullif(btrim(p_command->>'consumeResultId'), '');
  v_handoff_id text := nullif(btrim(p_command->>'consumeHandoffId'), '');
  v_next jsonb := p_command->'nextCurrent';
  v_next_state_id text;
  v_next_revision bigint;
  v_parent_state_id text;
  v_parent_revision bigint;
  v_source_result_id text;
  v_source_handoff_id text;
  v_source_authority text;
  v_current_state_id text;
  v_current_revision bigint;
  v_commit_sequence bigint;
begin
  begin
    v_expected_revision := (p_command->>'expectedCurrentRevision')::bigint;
    v_next_state_id := nullif(btrim(v_next#>>'{identity,stateId}'), '');
    v_next_revision := (v_next#>>'{identity,stateRevision}')::bigint;
    v_parent_state_id := nullif(btrim(v_next#>>'{writeBack,parent,parentStateId}'), '');
    v_parent_revision := (v_next#>>'{writeBack,parent,parentRevision}')::bigint;
    v_source_result_id := nullif(btrim(v_next#>>'{writeBack,source,sourceResultId}'), '');
    v_source_handoff_id := nullif(btrim(v_next#>>'{writeBack,source,sourceHandoffId}'), '');
    v_source_authority := nullif(btrim(v_next#>>'{humanDecisionFinal,sourceAuthority}'), '');
  exception when others then
    return jsonb_build_object('status','HOLD','reason','INVALID_ATOMIC_COMMIT');
  end;

  if v_expected_state_id is null
     or v_expected_revision is null or v_expected_revision < 1
     or v_result_id is null
     or v_handoff_id is null
     or v_next is null
     or jsonb_typeof(v_next) <> 'object'
     or v_next_state_id is null
     or v_next_revision is null
     or v_parent_state_id is null
     or v_parent_revision is null
     or v_source_result_id is null
     or v_source_handoff_id is null
     or v_source_authority <> 'KIYUSAMA'
     or v_next_state_id <> v_expected_state_id
     or v_next_revision <> v_expected_revision + 1
     or v_parent_state_id <> v_expected_state_id
     or v_parent_revision <> v_expected_revision
     or v_source_result_id <> v_result_id
     or v_source_handoff_id <> v_handoff_id then
    return jsonb_build_object('status','HOLD','reason','INVALID_ATOMIC_COMMIT');
  end if;

  select state_id, revision, commit_sequence
    into v_current_state_id, v_current_revision, v_commit_sequence
    from os2_storage_v01.current_state
   where singleton_id = true
   for update;

  if not found
     or v_current_state_id <> v_expected_state_id
     or v_current_revision <> v_expected_revision then
    return jsonb_build_object('status','HOLD','reason','REVISION_CONFLICT');
  end if;

  if exists(select 1 from os2_storage_v01.consumed_results where result_id = v_result_id) then
    return jsonb_build_object('status','HOLD','reason','RESULT_ALREADY_CONSUMED');
  end if;

  if exists(select 1 from os2_storage_v01.consumed_handoffs where handoff_id = v_handoff_id) then
    return jsonb_build_object('status','HOLD','reason','HANDOFF_ALREADY_CONSUMED');
  end if;

  -- All three writes occur after every guard while the CURRENT row is locked.
  -- They are part of this one PostgreSQL statement transaction boundary.
  insert into os2_storage_v01.consumed_results(result_id, handoff_id)
  values (v_result_id, v_handoff_id);

  insert into os2_storage_v01.consumed_handoffs(handoff_id, result_id)
  values (v_handoff_id, v_result_id);

  update os2_storage_v01.current_state
     set state_id = v_next_state_id,
         revision = v_next_revision,
         current_payload = v_next,
         commit_sequence = commit_sequence + 1,
         updated_at = now()
   where singleton_id = true
   returning commit_sequence into v_commit_sequence;

  return jsonb_build_object(
    'status','COMMITTED',
    'current',v_next,
    'commitSequence',v_commit_sequence
  );
exception
  when unique_violation then
    -- Concurrent/replay uniqueness races also fail closed. The statement is rolled back.
    if exists(select 1 from os2_storage_v01.consumed_results where result_id = v_result_id) then
      return jsonb_build_object('status','HOLD','reason','RESULT_ALREADY_CONSUMED');
    end if;
    if exists(select 1 from os2_storage_v01.consumed_handoffs where handoff_id = v_handoff_id) then
      return jsonb_build_object('status','HOLD','reason','HANDOFF_ALREADY_CONSUMED');
    end if;
    return jsonb_build_object('status','HOLD','reason','BACKEND_FAILURE');
  when others then
    raise;
end;
$$;

revoke all on function os2_storage_v01.compare_consume_and_swap(jsonb) from public, anon, authenticated;
grant execute on function os2_storage_v01.compare_consume_and_swap(jsonb) to service_role;
