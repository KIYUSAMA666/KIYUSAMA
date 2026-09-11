create schema if not exists os2_reentry_v01;

create table if not exists os2_reentry_v01.attestations (
  attestation_id text primary key,
  state_id text not null,
  lineage_id text not null,
  state_revision bigint not null check (state_revision > 0),
  commit_sequence bigint not null check (commit_sequence >= 0),
  status text not null check (status = 'VERIFIED'),
  evidence_verdict text not null check (evidence_verdict = 'SUFFICIENT'),
  observed_at timestamptz not null,
  evidence_source text not null,
  issuer_repository text not null,
  issuer_actor text not null,
  issuer_event_name text not null,
  issuer_ref text not null,
  issuer_sha text not null,
  issuer_workflow_ref text not null,
  evidence_run_id text not null,
  evidence_job_id text not null,
  created_at timestamptz not null default now()
);

revoke all on schema os2_reentry_v01 from public, anon, authenticated;
revoke all on table os2_reentry_v01.attestations from public, anon, authenticated;
grant usage on schema os2_reentry_v01 to service_role;
grant select, insert on table os2_reentry_v01.attestations to service_role;

create or replace function public.os2_reentry_issue_attestation(p_request jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, os2_reentry_v01, os2_storage_v01
as $$
declare
  v_current os2_storage_v01.current_state%rowtype;
  v_existing os2_reentry_v01.attestations%rowtype;
  v_observed_at timestamptz := clock_timestamp();
  v_attestation_id text := p_request->>'attestationId';
  v_state_id text := p_request->>'stateId';
  v_lineage_id text := p_request->>'lineageId';
  v_state_revision bigint;
  v_commit_sequence bigint;
begin
  if v_attestation_id is null or btrim(v_attestation_id) = '' or
     v_state_id is null or btrim(v_state_id) = '' or
     v_lineage_id is null or btrim(v_lineage_id) = '' or
     p_request->>'issuerRepository' is null or btrim(p_request->>'issuerRepository') = '' or
     p_request->>'issuerActor' is null or btrim(p_request->>'issuerActor') = '' or
     p_request->>'issuerEventName' is null or btrim(p_request->>'issuerEventName') = '' or
     p_request->>'issuerRef' is null or btrim(p_request->>'issuerRef') = '' or
     p_request->>'issuerSha' is null or btrim(p_request->>'issuerSha') = '' or
     p_request->>'issuerWorkflowRef' is null or btrim(p_request->>'issuerWorkflowRef') = '' or
     p_request->>'evidenceRunId' is null or btrim(p_request->>'evidenceRunId') = '' or
     p_request->>'evidenceJobId' is null or btrim(p_request->>'evidenceJobId') = '' then
    return jsonb_build_object('status','HOLD','reason','INVALID_ATTESTATION_REQUEST');
  end if;

  begin
    v_state_revision := (p_request->>'stateRevision')::bigint;
    v_commit_sequence := (p_request->>'commitSequence')::bigint;
  exception when others then
    return jsonb_build_object('status','HOLD','reason','INVALID_ATTESTATION_REQUEST');
  end;

  if v_state_revision < 1 or v_commit_sequence < 0 then
    return jsonb_build_object('status','HOLD','reason','INVALID_ATTESTATION_REQUEST');
  end if;

  select * into v_existing
  from os2_reentry_v01.attestations
  where attestation_id = v_attestation_id;

  if found then
    return jsonb_build_object('status','HOLD','reason','ATTESTATION_ALREADY_EXISTS');
  end if;

  select * into v_current
  from os2_storage_v01.current_state
  where singleton_id = true;

  if not found then
    return jsonb_build_object('status','HOLD','reason','CURRENT_NOT_FOUND');
  end if;

  if v_current.state_id <> v_state_id or
     v_current.revision <> v_state_revision or
     v_current.commit_sequence <> v_commit_sequence or
     coalesce(v_current.current_payload #>> '{identity,lineageId}', '') <> v_lineage_id then
    return jsonb_build_object('status','HOLD','reason','CURRENT_BINDING_MISMATCH');
  end if;

  insert into os2_reentry_v01.attestations (
    attestation_id,
    state_id,
    lineage_id,
    state_revision,
    commit_sequence,
    status,
    evidence_verdict,
    observed_at,
    evidence_source,
    issuer_repository,
    issuer_actor,
    issuer_event_name,
    issuer_ref,
    issuer_sha,
    issuer_workflow_ref,
    evidence_run_id,
    evidence_job_id
  ) values (
    v_attestation_id,
    v_state_id,
    v_lineage_id,
    v_state_revision,
    v_commit_sequence,
    'VERIFIED',
    'SUFFICIENT',
    v_observed_at,
    'KIRA_INDEPENDENT_GITHUB_OIDC',
    p_request->>'issuerRepository',
    p_request->>'issuerActor',
    p_request->>'issuerEventName',
    p_request->>'issuerRef',
    p_request->>'issuerSha',
    p_request->>'issuerWorkflowRef',
    p_request->>'evidenceRunId',
    p_request->>'evidenceJobId'
  );

  return jsonb_build_object(
    'status','ISSUED',
    'attestation', jsonb_build_object(
      'attestationId', v_attestation_id,
      'stateId', v_state_id,
      'lineageId', v_lineage_id,
      'stateRevision', v_state_revision,
      'commitSequence', v_commit_sequence,
      'status', 'VERIFIED',
      'evidenceVerdict', 'SUFFICIENT',
      'observedAt', v_observed_at,
      'evidenceSource', 'KIRA_INDEPENDENT_GITHUB_OIDC',
      'issuerRepository', p_request->>'issuerRepository',
      'issuerActor', p_request->>'issuerActor',
      'issuerEventName', p_request->>'issuerEventName',
      'issuerRef', p_request->>'issuerRef',
      'issuerSha', p_request->>'issuerSha',
      'issuerWorkflowRef', p_request->>'issuerWorkflowRef',
      'evidenceRunId', p_request->>'evidenceRunId',
      'evidenceJobId', p_request->>'evidenceJobId'
    )
  );
end;
$$;

create or replace function public.os2_reentry_read_attestation(p_attestation_id text)
returns jsonb
language sql
security invoker
set search_path = public, os2_reentry_v01
as $$
  select case
    when a.attestation_id is null then null
    else jsonb_build_object(
      'attestationId', a.attestation_id,
      'stateId', a.state_id,
      'lineageId', a.lineage_id,
      'stateRevision', a.state_revision,
      'commitSequence', a.commit_sequence,
      'status', a.status,
      'evidenceVerdict', a.evidence_verdict,
      'observedAt', a.observed_at,
      'evidenceSource', a.evidence_source,
      'issuerRepository', a.issuer_repository,
      'issuerActor', a.issuer_actor,
      'issuerEventName', a.issuer_event_name,
      'issuerRef', a.issuer_ref,
      'issuerSha', a.issuer_sha,
      'issuerWorkflowRef', a.issuer_workflow_ref,
      'evidenceRunId', a.evidence_run_id,
      'evidenceJobId', a.evidence_job_id
    )
  end
  from (select p_attestation_id as id) p
  left join os2_reentry_v01.attestations a on a.attestation_id = p.id;
$$;

revoke all on function public.os2_reentry_issue_attestation(jsonb) from public, anon, authenticated;
revoke all on function public.os2_reentry_read_attestation(text) from public, anon, authenticated;
grant execute on function public.os2_reentry_issue_attestation(jsonb) to service_role;
grant execute on function public.os2_reentry_read_attestation(text) to service_role;
