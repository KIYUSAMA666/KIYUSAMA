create schema if not exists os2_handoff_v01;

revoke all on schema os2_handoff_v01 from public, anon, authenticated;
grant usage on schema os2_handoff_v01 to service_role;

create or replace function os2_handoff_v01.valid_required_refs(p_refs jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    jsonb_typeof(p_refs) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_refs) as elem(value)
      where jsonb_typeof(value) <> 'object'
         or (
           select array_agg(key order by key)
           from jsonb_object_keys(value) as key
         ) is distinct from array['expectedVersion','id','path']::text[]
         or jsonb_typeof(value->'id') <> 'string'
         or btrim(value->>'id') = ''
         or (
           value->'expectedVersion' <> 'null'::jsonb
           and jsonb_typeof(value->'expectedVersion') <> 'string'
         )
         or (
           value->'path' <> 'null'::jsonb
           and jsonb_typeof(value->'path') <> 'string'
         )
    )
    and (
      select count(*) = count(distinct value->>'id')
      from jsonb_array_elements(p_refs)
    );
$$;

create table if not exists os2_handoff_v01.capability_bindings (
  capability_id uuid primary key references common_memory.executor_capabilities(id) on delete cascade,
  implementation_id text not null check (btrim(implementation_id) <> ''),
  source text not null check (source in ('NATIVE','HISTORY','EXTERNAL')),
  version text not null check (btrim(version) <> ''),
  binding_revision bigint not null check (binding_revision > 0),
  status text not null check (status in ('BOUND','HOLD')),
  verified boolean not null default false,
  verification_ref text,
  updated_at timestamptz not null default clock_timestamp(),
  check (
    status <> 'BOUND'
    or (
      verified is true
      and verification_ref is not null
      and btrim(verification_ref) <> ''
    )
  )
);

comment on column os2_handoff_v01.capability_bindings.binding_revision is
  'Mandatory monotonic binding revision. Runtime callers must present the expected revision; stale bindings fail closed.';
comment on column os2_handoff_v01.capability_bindings.verified is
  'Verification of capability-to-implementation binding. This is intentionally NOT equivalent to common_memory.executor_capabilities.payload_hash, which only binds an execution token to payload bytes.';

create table if not exists os2_handoff_v01.action_evidence_requirements (
  action_id text primary key check (btrim(action_id) <> ''),
  requirement_revision bigint not null check (requirement_revision > 0),
  required_refs jsonb not null default '[]'::jsonb,
  require_independent_lane boolean not null,
  status text not null check (status in ('ACTIVE','HOLD')),
  updated_at timestamptz not null default clock_timestamp(),
  check (os2_handoff_v01.valid_required_refs(required_refs))
);

comment on column os2_handoff_v01.action_evidence_requirements.requirement_revision is
  'Mandatory revision for stale-policy rejection. This table defines pre-execution evidence requirements; it does not replace close_task_with_evidence completion enforcement.';

alter table os2_handoff_v01.capability_bindings enable row level security;
alter table os2_handoff_v01.action_evidence_requirements enable row level security;

revoke all on table os2_handoff_v01.capability_bindings from public, anon, authenticated;
revoke all on table os2_handoff_v01.action_evidence_requirements from public, anon, authenticated;
grant select on table os2_handoff_v01.capability_bindings to service_role;
grant select on table os2_handoff_v01.action_evidence_requirements to service_role;

create or replace function public.os2_handoff_read_capability_binding_v01(
  p_capability_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = os2_handoff_v01, pg_catalog
as $$
declare
  r os2_handoff_v01.capability_bindings%rowtype;
begin
  if p_capability_id is null or p_expected_revision is null or p_expected_revision <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_INPUT');
  end if;

  select * into r
  from os2_handoff_v01.capability_bindings
  where capability_id = p_capability_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;
  if r.binding_revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'reason', 'STALE_BINDING');
  end if;
  if r.status <> 'BOUND' or r.verified is not true then
    return jsonb_build_object('ok', false, 'reason', 'NOT_READY');
  end if;

  return jsonb_build_object(
    'ok', true,
    'capabilityId', r.capability_id::text,
    'implementationId', r.implementation_id,
    'source', r.source,
    'version', r.version,
    'bindingRevision', r.binding_revision,
    'verified', r.verified,
    'verificationRef', r.verification_ref
  );
end;
$$;

create or replace function public.os2_handoff_read_action_evidence_requirement_v01(
  p_action_id text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = os2_handoff_v01, pg_catalog
as $$
declare
  r os2_handoff_v01.action_evidence_requirements%rowtype;
begin
  if p_action_id is null or btrim(p_action_id) = '' or p_expected_revision is null or p_expected_revision <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_INPUT');
  end if;

  select * into r
  from os2_handoff_v01.action_evidence_requirements
  where action_id = p_action_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;
  if r.requirement_revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'reason', 'STALE_REQUIREMENT');
  end if;
  if r.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'reason', 'NOT_READY');
  end if;

  return jsonb_build_object(
    'ok', true,
    'actionId', r.action_id,
    'requirementRevision', r.requirement_revision,
    'requiredRefs', r.required_refs,
    'requireIndependentLane', r.require_independent_lane
  );
end;
$$;

revoke all on function public.os2_handoff_read_capability_binding_v01(uuid,bigint) from public, anon, authenticated;
revoke all on function public.os2_handoff_read_action_evidence_requirement_v01(text,bigint) from public, anon, authenticated;
grant execute on function public.os2_handoff_read_capability_binding_v01(uuid,bigint) to service_role;
grant execute on function public.os2_handoff_read_action_evidence_requirement_v01(text,bigint) to service_role;
