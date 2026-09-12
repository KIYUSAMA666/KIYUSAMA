-- KIYUSAMA OS 2.0
-- RE-ENTRY ATOMIC EXECUTION COMMIT v0.1
--
-- One PostgreSQL function call is the authoritative transaction boundary for:
-- 1. exact re-entry authority validation and one-time authority claim,
-- 2. result consumption,
-- 3. handoff consumption,
-- 4. CURRENT compare-and-swap + commit-sequence advance.
--
-- No effect may survive alone. All writes are inside one nested PL/pgSQL block;
-- a caught unique_violation rolls that block back before a HOLD is returned.

create or replace function public.os2_reentry_atomic_execution_commit(p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, os2_reentry_v01, os2_storage_v01
as $$
declare
  v_lease jsonb := p_input->'lease';
  v_request jsonb := p_input->'request';
  v_commit jsonb := p_input->'atomicCommit';
  v_next jsonb := p_input#>'{atomicCommit,nextCurrent}';

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

  v_expected_state_id text;
  v_expected_revision bigint;
  v_result_id text;
  v_handoff_id text;
  v_next_state_id text;
  v_next_revision bigint;
  v_parent_state_id text;
  v_parent_revision bigint;
  v_source_result_id text;
  v_source_handoff_id text;
  v_source_authority text;
  v_next_action_id text;

  v_current os2_storage_v01.current_state%rowtype;
  v_attestation os2_reentry_v01.attestations%rowtype;
  v_new_commit_sequence bigint;
begin
  if jsonb_typeof(p_input) <> 'object'
     or jsonb_typeof(v_lease) <> 'object'
     or jsonb_typeof(v_request) <> 'object'
     or jsonb_typeof(v_commit) <> 'object'
     or jsonb_typeof(v_next) <> 'object' then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  v_authority_key := nullif(btrim(v_lease->>'authorityKey'), '');
  v_lease_id := nullif(btrim(v_lease->>'leaseId'), '');
  v_action_id := nullif(btrim(v_lease->>'actionId'), '');
  v_state_id := nullif(btrim(v_lease->>'stateId'), '');
  v_attestation_id := nullif(btrim(v_lease->>'attestationId'), '');
  v_attestation_source := nullif(btrim(v_lease->>'attestationSource'), '');

  if v_authority_key is null or v_lease_id is null or v_action_id is null
     or v_state_id is null or v_attestation_id is null or v_attestation_source is null then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  if v_request->>'leaseId' is distinct from v_lease_id
     or v_request->>'authorityKey' is distinct from v_authority_key
     or v_request->>'actionId' is distinct from v_action_id
     or v_request->>'stateId' is distinct from v_state_id
     or v_request->>'stateRevision' is distinct from v_lease->>'stateRevision'
     or v_request->>'commitSequence' is distinct from v_lease->>'commitSequence' then
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

    v_expected_state_id := nullif(btrim(v_commit#>>'{expectedCurrent,expectedCurrentStateId}'), '');
    v_expected_revision := (v_commit#>>'{expectedCurrent,expectedCurrentRevision}')::bigint;
    v_result_id := nullif(btrim(v_commit->>'consumeResultId'), '');
    v_handoff_id := nullif(btrim(v_commit->>'consumeHandoffId'), '');
    v_next_state_id := nullif(btrim(v_next#>>'{identity,stateId}'), '');
    v_next_revision := (v_next#>>'{identity,stateRevision}')::bigint;
    v_parent_state_id := nullif(btrim(v_next#>>'{writeBack,parent,parentStateId}'), '');
    v_parent_revision := (v_next#>>'{writeBack,parent,parentRevision}')::bigint;
    v_source_result_id := nullif(btrim(v_next#>>'{writeBack,source,sourceResultId}'), '');
    v_source_handoff_id := nullif(btrim(v_next#>>'{writeBack,source,sourceHandoffId}'), '');
    v_source_authority := nullif(btrim(v_next#>>'{humanDecisionFinal,sourceAuthority}'), '');
    v_next_action_id := nullif(btrim(v_next#>>'{nextActionSingle,actionId}'), '');
  exception when others then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end;

  if v_state_revision < 1 or v_commit_sequence < 0
     or jsonb_typeof(v_authority_json) <> 'array'
     or jsonb_array_length(v_authority_json) <> 8
     or v_authority_json->>0 is distinct from 'OS2_REENTRY_AUTHORITY_V01'
     or v_authority_json->>1 is distinct from v_action_id
     or v_authority_json->>2 is distinct from v_state_id
     or v_authority_json->>3 is distinct from v_state_revision::text
     or v_authority_json->>4 is distinct from v_commit_sequence::text
     or v_authority_json->>5 is distinct from v_attestation_id
     or v_authority_json->>6 is distinct from v_lease->>'attestationObservedAt'
     or v_authority_json->>7 is distinct from v_attestation_source then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  if v_attestation_observed_at > v_issued_at
     or v_issued_at >= v_expires_at
     or v_expires_at > v_reentry_authority_expires_at
     or v_claimed_at < v_issued_at
     or v_claimed_at >= v_expires_at
     or v_claimed_at >= v_reentry_authority_expires_at then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  select * into v_attestation
    from os2_reentry_v01.attestations
   where attestation_id = v_attestation_id;

  if not found
     or v_attestation.state_id <> v_state_id
     or v_attestation.state_revision <> v_state_revision
     or v_attestation.commit_sequence <> v_commit_sequence
     or v_attestation.observed_at <> v_attestation_observed_at
     or v_attestation.evidence_source <> v_attestation_source
     or v_attestation.status <> 'VERIFIED'
     or v_attestation.evidence_verdict <> 'SUFFICIENT' then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  -- Lock CURRENT before deciding whether this authority still targets the live state.
  select * into v_current
    from os2_storage_v01.current_state
   where singleton_id = true
   for update;

  if not found
     or v_current.state_id <> v_state_id
     or v_current.revision <> v_state_revision
     or v_current.commit_sequence <> v_commit_sequence then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  -- Bind the verified atomic commit to the exact authority and live CURRENT.
  if v_expected_state_id is null or v_expected_revision is null
     or v_result_id is null or v_handoff_id is null
     or v_next_state_id is null or v_next_revision is null
     or v_parent_state_id is null or v_parent_revision is null
     or v_source_result_id is null or v_source_handoff_id is null
     or v_source_authority <> 'KIYUSAMA'
     or v_next_action_id <> v_action_id
     or v_expected_state_id <> v_state_id
     or v_expected_revision <> v_state_revision
     or v_next_state_id <> v_state_id
     or v_next_revision <> v_state_revision + 1
     or v_parent_state_id <> v_state_id
     or v_parent_revision <> v_state_revision
     or v_source_result_id <> v_result_id
     or v_source_handoff_id <> v_handoff_id then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  if exists(select 1 from os2_reentry_v01.authority_lease_claims where authority_key = v_authority_key) then
    return jsonb_build_object('status','ALREADY_CONSUMED');
  end if;
  if exists(select 1 from os2_storage_v01.consumed_results where result_id = v_result_id) then
    return jsonb_build_object('status','COMMIT_REJECTED','reason','RESULT_ALREADY_CONSUMED');
  end if;
  if exists(select 1 from os2_storage_v01.consumed_handoffs where handoff_id = v_handoff_id) then
    return jsonb_build_object('status','COMMIT_REJECTED','reason','HANDOFF_ALREADY_CONSUMED');
  end if;

  begin
    insert into os2_reentry_v01.authority_lease_claims (
      authority_key, lease_id, action_id, state_id, state_revision,
      commit_sequence, attestation_id, attestation_observed_at,
      attestation_source, reentry_authority_expires_at,
      issued_at, expires_at, claimed_at
    ) values (
      v_authority_key, v_lease_id, v_action_id, v_state_id, v_state_revision,
      v_commit_sequence, v_attestation_id, v_attestation_observed_at,
      v_attestation_source, v_reentry_authority_expires_at,
      v_issued_at, v_expires_at, v_claimed_at
    );

    insert into os2_storage_v01.consumed_results(result_id, handoff_id)
    values (v_result_id, v_handoff_id);

    insert into os2_storage_v01.consumed_handoffs(handoff_id, result_id)
    values (v_handoff_id, v_result_id);

    update os2_storage_v01.current_state
       set state_id = v_next_state_id,
           revision = v_next_revision,
           current_payload = v_next,
           commit_sequence = commit_sequence + 1,
           updated_at = v_claimed_at
     where singleton_id = true
       and state_id = v_state_id
       and revision = v_state_revision
       and commit_sequence = v_commit_sequence
     returning commit_sequence into v_new_commit_sequence;

    if not found then
      raise exception using errcode = 'P0001', message = 'CURRENT_CHANGED_DURING_ATOMIC_COMMIT';
    end if;
  exception
    when unique_violation then
      -- The nested block has rolled back before these conflict checks execute.
      if exists(select 1 from os2_reentry_v01.authority_lease_claims where authority_key = v_authority_key) then
        return jsonb_build_object('status','ALREADY_CONSUMED');
      end if;
      if exists(select 1 from os2_storage_v01.consumed_results where result_id = v_result_id) then
        return jsonb_build_object('status','COMMIT_REJECTED','reason','RESULT_ALREADY_CONSUMED');
      end if;
      if exists(select 1 from os2_storage_v01.consumed_handoffs where handoff_id = v_handoff_id) then
        return jsonb_build_object('status','COMMIT_REJECTED','reason','HANDOFF_ALREADY_CONSUMED');
      end if;
      return jsonb_build_object('status','COMMIT_REJECTED','reason','BACKEND_FAILURE');
    when others then
      return jsonb_build_object('status','COMMIT_REJECTED','reason','BACKEND_FAILURE');
  end;

  return jsonb_build_object(
    'status','COMMITTED',
    'commitSequence',v_new_commit_sequence,
    'authorityKey',v_authority_key
  );
end;
$$;

revoke all on function public.os2_reentry_atomic_execution_commit(jsonb) from public, anon, authenticated;
grant execute on function public.os2_reentry_atomic_execution_commit(jsonb) to service_role;
