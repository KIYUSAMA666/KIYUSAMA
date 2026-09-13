-- KIYUSAMA OS 2.0
-- AI COMMUNICATION BUS durable backend v0.1

create schema if not exists os2_bus_v01;
revoke all on schema os2_bus_v01 from public, anon, authenticated;
grant usage on schema os2_bus_v01 to service_role;

create table if not exists os2_bus_v01.messages (
  message_id text primary key,
  trace_id text not null,
  kind text not null check (kind in ('MESSAGE','REPLY')),
  source_agent_id text not null,
  target_agent_id text not null,
  parent_message_id text null,
  current_state_id text not null,
  current_state_revision bigint not null check (current_state_revision >= 0),
  created_at timestamptz not null,
  payload jsonb not null,
  status text not null check (status in ('PENDING','DELIVERED','ACKNOWLEDGED','UNKNOWN','TERMINAL_FAILED')),
  delivered_to_agent_id text null,
  acknowledged_by_agent_id text null,
  attempt_sequence bigint not null check (attempt_sequence >= 0),
  updated_at timestamptz not null,
  unknown_reason text null,
  check (source_agent_id <> target_agent_id),
  check ((kind = 'MESSAGE' and parent_message_id is null) or (kind = 'REPLY' and parent_message_id is not null)),
  check (
    (status = 'PENDING' and delivered_to_agent_id is null and acknowledged_by_agent_id is null and unknown_reason is null)
    or (status = 'DELIVERED' and delivered_to_agent_id = target_agent_id and acknowledged_by_agent_id is null and unknown_reason is null)
    or (status = 'ACKNOWLEDGED' and delivered_to_agent_id = target_agent_id and acknowledged_by_agent_id = target_agent_id and unknown_reason is null)
    or (status = 'UNKNOWN' and acknowledged_by_agent_id is null and unknown_reason is not null and btrim(unknown_reason) <> '')
    or (status = 'TERMINAL_FAILED' and acknowledged_by_agent_id is null and unknown_reason is null)
  )
);

alter table os2_bus_v01.messages enable row level security;
revoke all on table os2_bus_v01.messages from public, anon, authenticated;
grant select, insert, update on table os2_bus_v01.messages to service_role;

create or replace function public.os2_bus_store_record(p_expected_status text, p_record jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, os2_bus_v01
as $$
declare
  v_message_id text := nullif(btrim(p_record#>>'{message,messageId}'), '');
  v_trace_id text := nullif(btrim(p_record#>>'{message,traceId}'), '');
  v_kind text := nullif(btrim(p_record#>>'{message,kind}'), '');
  v_source_agent_id text := nullif(btrim(p_record#>>'{message,sourceAgentId}'), '');
  v_target_agent_id text := nullif(btrim(p_record#>>'{message,targetAgentId}'), '');
  v_parent_message_id text := nullif(btrim(p_record#>>'{message,parentMessageId}'), '');
  v_current_state_id text := nullif(btrim(p_record#>>'{message,current,stateId}'), '');
  v_current_state_revision bigint;
  v_created_at timestamptz;
  v_payload jsonb := p_record#>'{message,payload}';
  v_status text := nullif(btrim(p_record->>'status'), '');
  v_delivered_to text := nullif(btrim(p_record->>'deliveredToAgentId'), '');
  v_ack_by text := nullif(btrim(p_record->>'acknowledgedByAgentId'), '');
  v_attempt_sequence bigint;
  v_updated_at timestamptz;
  v_unknown_reason text := nullif(btrim(p_record->>'unknownReason'), '');
  v_existing os2_bus_v01.messages%rowtype;
  v_same boolean;
  v_transition_ok boolean := false;
begin
  if jsonb_typeof(p_record) <> 'object' or jsonb_typeof(p_record->'message') <> 'object' then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;
  begin
    v_current_state_revision := (p_record#>>'{message,current,stateRevision}')::bigint;
    v_created_at := (p_record#>>'{message,createdAt}')::timestamptz;
    v_attempt_sequence := (p_record->>'attemptSequence')::bigint;
    v_updated_at := (p_record->>'updatedAt')::timestamptz;
  exception when others then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end;
  if v_message_id is null or v_trace_id is null or v_kind not in ('MESSAGE','REPLY')
     or v_source_agent_id is null or v_target_agent_id is null or v_source_agent_id = v_target_agent_id
     or v_current_state_id is null or v_current_state_revision < 0 or v_attempt_sequence < 0
     or v_status not in ('PENDING','DELIVERED','ACKNOWLEDGED','UNKNOWN','TERMINAL_FAILED')
     or v_payload is null then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  select * into v_existing from os2_bus_v01.messages where message_id = v_message_id for update;

  if not found then
    if p_expected_status is not null or v_status <> 'PENDING' then
      return jsonb_build_object('status','STATE_CONFLICT');
    end if;
    begin
      insert into os2_bus_v01.messages(message_id,trace_id,kind,source_agent_id,target_agent_id,parent_message_id,current_state_id,current_state_revision,created_at,payload,status,delivered_to_agent_id,acknowledged_by_agent_id,attempt_sequence,updated_at,unknown_reason)
      values(v_message_id,v_trace_id,v_kind,v_source_agent_id,v_target_agent_id,v_parent_message_id,v_current_state_id,v_current_state_revision,v_created_at,v_payload,v_status,v_delivered_to,v_ack_by,v_attempt_sequence,v_updated_at,v_unknown_reason);
      return jsonb_build_object('status','STORED');
    exception when others then
      return jsonb_build_object('status','BACKEND_FAILURE');
    end;
  end if;

  v_same := v_existing.trace_id = v_trace_id and v_existing.kind = v_kind and v_existing.source_agent_id = v_source_agent_id
    and v_existing.target_agent_id = v_target_agent_id and v_existing.parent_message_id is not distinct from v_parent_message_id
    and v_existing.current_state_id = v_current_state_id and v_existing.current_state_revision = v_current_state_revision
    and v_existing.created_at = v_created_at and v_existing.payload = v_payload and v_existing.status = v_status
    and v_existing.delivered_to_agent_id is not distinct from v_delivered_to and v_existing.acknowledged_by_agent_id is not distinct from v_ack_by
    and v_existing.attempt_sequence = v_attempt_sequence and v_existing.updated_at = v_updated_at and v_existing.unknown_reason is not distinct from v_unknown_reason;
  if v_same then return jsonb_build_object('status','IDEMPOTENT'); end if;

  if v_existing.trace_id <> v_trace_id or v_existing.kind <> v_kind or v_existing.source_agent_id <> v_source_agent_id
     or v_existing.target_agent_id <> v_target_agent_id or v_existing.parent_message_id is distinct from v_parent_message_id
     or v_existing.current_state_id <> v_current_state_id or v_existing.current_state_revision <> v_current_state_revision
     or v_existing.created_at <> v_created_at or v_existing.payload <> v_payload then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;
  if p_expected_status is null or v_existing.status <> p_expected_status then
    return jsonb_build_object('status','STATE_CONFLICT');
  end if;

  v_transition_ok :=
    (v_existing.status = 'PENDING' and v_status in ('DELIVERED','UNKNOWN','TERMINAL_FAILED')) or
    (v_existing.status = 'DELIVERED' and v_status in ('ACKNOWLEDGED','UNKNOWN')) or
    (v_existing.status = 'UNKNOWN' and v_status in ('PENDING','DELIVERED','TERMINAL_FAILED'));
  if not v_transition_ok then return jsonb_build_object('status','INVALID_TRANSITION'); end if;
  if v_attempt_sequence < v_existing.attempt_sequence then return jsonb_build_object('status','STATE_CONFLICT'); end if;

  begin
    update os2_bus_v01.messages set
      status=v_status, delivered_to_agent_id=v_delivered_to, acknowledged_by_agent_id=v_ack_by,
      attempt_sequence=v_attempt_sequence, updated_at=v_updated_at, unknown_reason=v_unknown_reason
    where message_id=v_message_id;
  exception when others then
    return jsonb_build_object('status','BACKEND_FAILURE');
  end;
  return jsonb_build_object('status','STORED');
end;
$$;

create or replace function public.os2_bus_read_record(p_message_id text)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, os2_bus_v01
as $$
  select case when m.message_id is null then null else jsonb_build_object(
    'message', jsonb_build_object('messageId',m.message_id,'traceId',m.trace_id,'kind',m.kind,'sourceAgentId',m.source_agent_id,'targetAgentId',m.target_agent_id,'parentMessageId',m.parent_message_id,'current',jsonb_build_object('stateId',m.current_state_id,'stateRevision',m.current_state_revision),'createdAt',m.created_at,'payload',m.payload),
    'status',m.status,'deliveredToAgentId',m.delivered_to_agent_id,'acknowledgedByAgentId',m.acknowledged_by_agent_id,
    'attemptSequence',m.attempt_sequence,'updatedAt',m.updated_at,'unknownReason',m.unknown_reason
  ) end
  from (select * from os2_bus_v01.messages where message_id = p_message_id) m;
$$;

revoke all on function public.os2_bus_store_record(text,jsonb) from public, anon, authenticated;
revoke all on function public.os2_bus_read_record(text) from public, anon, authenticated;
grant execute on function public.os2_bus_store_record(text,jsonb) to service_role;
grant execute on function public.os2_bus_read_record(text) to service_role;
