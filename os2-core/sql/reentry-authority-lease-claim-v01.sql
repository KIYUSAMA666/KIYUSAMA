create table if not exists os2_reentry_v01.authority_lease_claims (
  authority_key text primary key,
  lease_id text not null unique,
  action_id text not null,
  state_id text not null,
  state_revision bigint not null check (state_revision > 0),
  commit_sequence bigint not null check (commit_sequence >= 0),
  attestation_id text not null,
  attestation_observed_at timestamptz not null,
  attestation_source text not null,
  reentry_authority_expires_at timestamptz not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  claimed_at timestamptz not null,
  check (attestation_observed_at <= issued_at),
  check (issued_at < expires_at),
  check (expires_at <= reentry_authority_expires_at),
  unique (
    action_id,
    state_id,
    state_revision,
    commit_sequence,
    attestation_id,
    attestation_observed_at,
    attestation_source
  )
);

revoke all on table os2_reentry_v01.authority_lease_claims from public, anon, authenticated;
grant select, insert on table os2_reentry_v01.authority_lease_claims to service_role;

create or replace function public.os2_reentry_claim_authority_lease(p_claim jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, os2_reentry_v01, os2_storage_v01
as $$
declare
  v_lease jsonb := p_claim->'lease';
  v_request jsonb := p_claim->'request';
  v_authority_key text;
  v_authority_json jsonb;
  v_lease_id text;
  v_action_id text;
  v_state_id text;
  v_state_revision bigint;
  v_commit_sequence bigint;
  v_attestation_id text;
  v_attestation_observed_at timestamptz;
  v_attestation_source text;
  v_reentry_authority_expires_at timestamptz;
  v_issued_at timestamptz;
  v_expires_at timestamptz;
  v_claimed_at timestamptz := clock_timestamp();
  v_current os2_storage_v01.current_state%rowtype;
  v_attestation os2_reentry_v01.attestations%rowtype;
begin
  if jsonb_typeof(v_lease) <> 'object' or jsonb_typeof(v_request) <> 'object' then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  v_authority_key := v_lease->>'authorityKey';
  v_lease_id := v_lease->>'leaseId';
  v_action_id := v_lease->>'actionId';
  v_state_id := v_lease->>'stateId';
  v_attestation_id := v_lease->>'attestationId';
  v_attestation_source := v_lease->>'attestationSource';

  if v_authority_key is null or btrim(v_authority_key) = '' or
     v_lease_id is null or btrim(v_lease_id) = '' or
     v_action_id is null or btrim(v_action_id) = '' or
     v_state_id is null or btrim(v_state_id) = '' or
     v_attestation_id is null or btrim(v_attestation_id) = '' or
     v_attestation_source is null or btrim(v_attestation_source) = '' then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  if v_request->>'leaseId' is distinct from v_lease_id or
     v_request->>'authorityKey' is distinct from v_authority_key or
     v_request->>'actionId' is distinct from v_action_id or
     v_request->>'stateId' is distinct from v_state_id or
     v_request->>'stateRevision' is distinct from v_lease->>'stateRevision' or
     v_request->>'commitSequence' is distinct from v_lease->>'commitSequence' then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  begin
    v_state_revision := (v_lease->>'stateRevision')::bigint;
    v_commit_sequence := (v_lease->>'commitSequence')::bigint;
    v_attestation_observed_at := (v_lease->>'attestationObservedAt')::timestamptz;
    v_reentry_authority_expires_at := (v_lease->>'reentryAuthorityExpiresAt')::timestamptz;
    v_issued_at := (v_lease->>'issuedAt')::timestamptz;
    v_expires_at := (v_lease->>'expiresAt')::timestamptz;
    v_authority_json := v_authority_key::jsonb;
  exception when others then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end;

  if v_state_revision < 1 or v_commit_sequence < 0 or
     jsonb_typeof(v_authority_json) <> 'array' or jsonb_array_length(v_authority_json) <> 8 or
     v_authority_json->>0 is distinct from 'OS2_REENTRY_AUTHORITY_V01' or
     v_authority_json->>1 is distinct from v_action_id or
     v_authority_json->>2 is distinct from v_state_id or
     v_authority_json->>3 is distinct from v_state_revision::text or
     v_authority_json->>4 is distinct from v_commit_sequence::text or
     v_authority_json->>5 is distinct from v_attestation_id or
     v_authority_json->>6 is distinct from v_lease->>'attestationObservedAt' or
     v_authority_json->>7 is distinct from v_attestation_source then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  if v_attestation_observed_at > v_issued_at or
     v_issued_at >= v_expires_at or
     v_expires_at > v_reentry_authority_expires_at or
     v_claimed_at < v_issued_at or
     v_claimed_at >= v_expires_at or
     v_claimed_at >= v_reentry_authority_expires_at then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  select * into v_attestation
  from os2_reentry_v01.attestations
  where attestation_id = v_attestation_id;

  if not found or
     v_attestation.state_id <> v_state_id or
     v_attestation.state_revision <> v_state_revision or
     v_attestation.commit_sequence <> v_commit_sequence or
     v_attestation.observed_at <> v_attestation_observed_at or
     v_attestation.evidence_source <> v_attestation_source or
     v_attestation.status <> 'VERIFIED' or
     v_attestation.evidence_verdict <> 'SUFFICIENT' then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  select * into v_current
  from os2_storage_v01.current_state
  where singleton_id = true;

  if not found or
     v_current.state_id <> v_state_id or
     v_current.revision <> v_state_revision or
     v_current.commit_sequence <> v_commit_sequence then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  begin
    insert into os2_reentry_v01.authority_lease_claims (
      authority_key,
      lease_id,
      action_id,
      state_id,
      state_revision,
      commit_sequence,
      attestation_id,
      attestation_observed_at,
      attestation_source,
      reentry_authority_expires_at,
      issued_at,
      expires_at,
      claimed_at
    ) values (
      v_authority_key,
      v_lease_id,
      v_action_id,
      v_state_id,
      v_state_revision,
      v_commit_sequence,
      v_attestation_id,
      v_attestation_observed_at,
      v_attestation_source,
      v_reentry_authority_expires_at,
      v_issued_at,
      v_expires_at,
      v_claimed_at
    );
  exception when unique_violation then
    return jsonb_build_object('status','ALREADY_CONSUMED');
  end;

  return jsonb_build_object('status','CLAIMED');
end;
$$;

revoke all on function public.os2_reentry_claim_authority_lease(jsonb) from public, anon, authenticated;
grant execute on function public.os2_reentry_claim_authority_lease(jsonb) to service_role;
