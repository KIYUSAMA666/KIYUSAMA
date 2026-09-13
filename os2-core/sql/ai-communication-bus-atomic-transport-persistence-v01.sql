-- KIYUSAMA OS 2.0
-- AI COMMUNICATION BUS atomic message + transport persistence v0.1
-- Repository-only migration candidate. Do not apply to production without explicit approval.

create schema if not exists os2_bus_v01;
revoke all on schema os2_bus_v01 from public, anon, authenticated;
grant usage on schema os2_bus_v01 to service_role;

create table if not exists os2_bus_v01.transport_evidence (
  message_id text primary key references os2_bus_v01.messages(message_id) on delete restrict,
  trace_id text not null,
  target_agent_id text not null,
  provider text not null,
  provider_delivery_id text not null,
  observed_at timestamptz not null,
  status text not null check (status = 'DELIVERED'),
  check (btrim(provider) <> ''),
  check (btrim(provider_delivery_id) <> ''),
  check (btrim(trace_id) <> ''),
  check (btrim(target_agent_id) <> '')
);

alter table os2_bus_v01.transport_evidence enable row level security;
revoke all on table os2_bus_v01.transport_evidence from public, anon, authenticated;
grant select, insert on table os2_bus_v01.transport_evidence to service_role;

create or replace function public.os2_bus_persist_delivered_with_transport(
  p_message jsonb,
  p_delivery jsonb,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, os2_bus_v01
as $$
declare
  v_message_id text := nullif(btrim(p_message->>'messageId'), '');
  v_trace_id text := nullif(btrim(p_message->>'traceId'), '');
  v_kind text := nullif(btrim(p_message->>'kind'), '');
  v_source text := nullif(btrim(p_message->>'sourceAgentId'), '');
  v_target text := nullif(btrim(p_message->>'targetAgentId'), '');
  v_parent text := nullif(btrim(p_message->>'parentMessageId'), '');
  v_state_id text := nullif(btrim(p_message#>>'{current,stateId}'), '');
  v_state_revision bigint;
  v_created_at timestamptz;
  v_payload jsonb := p_message->'payload';
  v_provider text := nullif(btrim(p_evidence->>'provider'), '');
  v_provider_delivery_id text := nullif(btrim(p_evidence->>'providerDeliveryId'), '');
  v_observed_at timestamptz;
  v_existing os2_bus_v01.messages%rowtype;
  v_evidence os2_bus_v01.transport_evidence%rowtype;
begin
  if jsonb_typeof(p_message) <> 'object'
     or jsonb_typeof(p_delivery) <> 'object'
     or jsonb_typeof(p_evidence) <> 'object' then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  begin
    v_state_revision := (p_message#>>'{current,stateRevision}')::bigint;
    v_created_at := (p_message->>'createdAt')::timestamptz;
    v_observed_at := (p_evidence->>'observedAt')::timestamptz;
  exception when others then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end;

  if v_message_id is null or v_trace_id is null or v_kind not in ('MESSAGE','REPLY')
     or v_source is null or v_target is null or v_source = v_target
     or v_state_id is null or v_state_revision < 0 or v_payload is null
     or v_provider is null or v_provider_delivery_id is null then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  if (v_kind = 'MESSAGE' and v_parent is not null)
     or (v_kind = 'REPLY' and v_parent is null) then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  if p_delivery->>'status' <> 'DELIVERED'
     or p_delivery->>'deliveredToAgentId' <> v_target
     or p_delivery->>'acknowledgedByAgentId' is not null
     or p_delivery#>>'{message,messageId}' <> v_message_id
     or p_delivery#>>'{message,traceId}' <> v_trace_id
     or p_delivery#>>'{message,targetAgentId}' <> v_target then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  if p_evidence->>'status' <> 'DELIVERED'
     or p_evidence->>'messageId' <> v_message_id
     or p_evidence->>'traceId' <> v_trace_id
     or p_evidence->>'targetAgentId' <> v_target then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  select * into v_existing
  from os2_bus_v01.messages
  where message_id = v_message_id
  for update;

  if found then
    if v_existing.trace_id <> v_trace_id
       or v_existing.kind <> v_kind
       or v_existing.source_agent_id <> v_source
       or v_existing.target_agent_id <> v_target
       or v_existing.parent_message_id is distinct from v_parent
       or v_existing.current_state_id <> v_state_id
       or v_existing.current_state_revision <> v_state_revision
       or v_existing.created_at <> v_created_at
       or v_existing.payload <> v_payload
       or v_existing.status <> 'DELIVERED'
       or v_existing.delivered_to_agent_id <> v_target
       or v_existing.acknowledged_by_agent_id is not null then
      return jsonb_build_object('status','BINDING_MISMATCH');
    end if;
  else
    insert into os2_bus_v01.messages(
      message_id,trace_id,kind,source_agent_id,target_agent_id,parent_message_id,
      current_state_id,current_state_revision,created_at,payload,status,
      delivered_to_agent_id,acknowledged_by_agent_id,attempt_sequence,updated_at,unknown_reason
    ) values (
      v_message_id,v_trace_id,v_kind,v_source,v_target,v_parent,
      v_state_id,v_state_revision,v_created_at,v_payload,'DELIVERED',
      v_target,null,1,v_observed_at,null
    );
  end if;

  select * into v_evidence
  from os2_bus_v01.transport_evidence
  where message_id = v_message_id
  for update;

  if found then
    if v_evidence.trace_id <> v_trace_id
       or v_evidence.target_agent_id <> v_target
       or v_evidence.provider <> v_provider
       or v_evidence.provider_delivery_id <> v_provider_delivery_id
       or v_evidence.observed_at <> v_observed_at
       or v_evidence.status <> 'DELIVERED' then
      return jsonb_build_object('status','BINDING_MISMATCH');
    end if;
    return jsonb_build_object(
      'status','IDEMPOTENT',
      'storedMessageId',v_message_id,
      'storedTraceId',v_trace_id,
      'storedProviderDeliveryId',v_provider_delivery_id
    );
  end if;

  insert into os2_bus_v01.transport_evidence(
    message_id,trace_id,target_agent_id,provider,provider_delivery_id,observed_at,status
  ) values (
    v_message_id,v_trace_id,v_target,v_provider,v_provider_delivery_id,v_observed_at,'DELIVERED'
  );

  return jsonb_build_object(
    'status','STORED',
    'storedMessageId',v_message_id,
    'storedTraceId',v_trace_id,
    'storedProviderDeliveryId',v_provider_delivery_id
  );
exception when others then
  return jsonb_build_object('status','BACKEND_FAILURE');
end;
$$;

revoke all on function public.os2_bus_persist_delivered_with_transport(jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.os2_bus_persist_delivered_with_transport(jsonb,jsonb,jsonb)
  to service_role;
