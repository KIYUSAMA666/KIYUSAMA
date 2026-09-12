-- KIYUSAMA OS 2.0
-- RE-ENTRY DURABLE COMMIT RECEIPT v0.1
--
-- Closes the post-commit acknowledgement ambiguity: a PostgreSQL commit may
-- succeed even when the client loses the RPC response. A durable receipt is
-- therefore written inside the SAME nested transaction block as authority
-- claim + result/handoff consumption + CURRENT swap. The receipt can later be
-- read through a service-role-only SECURITY INVOKER RPC and matched against the
-- exact original authority/commit binding.

create table if not exists os2_reentry_v01.atomic_commit_receipts (
  authority_key text primary key references os2_reentry_v01.authority_lease_claims(authority_key),
  receipt_version text not null check (receipt_version = 'OS2_REENTRY_COMMIT_RECEIPT_V01'),
  lease_id text not null,
  action_id text not null,
  state_id text not null,
  from_revision bigint not null check (from_revision >= 1),
  to_revision bigint not null check (to_revision = from_revision + 1),
  prior_commit_sequence bigint not null check (prior_commit_sequence >= 0),
  committed_sequence bigint not null check (committed_sequence = prior_commit_sequence + 1),
  result_id text not null unique,
  handoff_id text not null unique,
  next_current jsonb not null,
  committed_at timestamptz not null,
  unique (lease_id),
  unique (action_id, state_id, from_revision, prior_commit_sequence)
);

alter table os2_reentry_v01.atomic_commit_receipts enable row level security;
revoke all on os2_reentry_v01.atomic_commit_receipts from public, anon, authenticated;
grant select, insert on os2_reentry_v01.atomic_commit_receipts to service_role;

create or replace function public.os2_reentry_read_atomic_commit_receipt(p_authority_key text)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, os2_reentry_v01
as $$
declare
  v_key text := nullif(btrim(p_authority_key), '');
  v_receipt os2_reentry_v01.atomic_commit_receipts%rowtype;
begin
  if v_key is null then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  select * into v_receipt
    from os2_reentry_v01.atomic_commit_receipts
   where authority_key = v_key;

  if not found then
    return jsonb_build_object('status','NOT_FOUND');
  end if;

  return jsonb_build_object(
    'status','COMMITTED',
    'receiptVersion',v_receipt.receipt_version,
    'authorityKey',v_receipt.authority_key,
    'leaseId',v_receipt.lease_id,
    'actionId',v_receipt.action_id,
    'stateId',v_receipt.state_id,
    'fromRevision',v_receipt.from_revision,
    'toRevision',v_receipt.to_revision,
    'priorCommitSequence',v_receipt.prior_commit_sequence,
    'committedSequence',v_receipt.committed_sequence,
    'resultId',v_receipt.result_id,
    'handoffId',v_receipt.handoff_id,
    'nextCurrent',v_receipt.next_current,
    'committedAt',v_receipt.committed_at
  );
end;
$$;

revoke all on function public.os2_reentry_read_atomic_commit_receipt(text) from public, anon, authenticated;
grant execute on function public.os2_reentry_read_atomic_commit_receipt(text) to service_role;

-- Replace the v0.1 combined commit primitive so the receipt is part of the
-- authoritative commit boundary, rather than an application-side follow-up.
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

    insert into os2_reentry_v01.atomic_commit_receipts (
      authority_key, receipt_version, lease_id, action_id, state_id,
      from_revision, to_revision, prior_commit_sequence, committed_sequence,
      result_id, handoff_id, next_current, committed_at
    ) values (
      v_authority_key, 'OS2_REENTRY_COMMIT_RECEIPT_V01', v_lease_id, v_action_id, v_state_id,
      v_state_revision, v_next_revision, v_commit_sequence, v_new_commit_sequence,
      v_result_id, v_handoff_id, v_next, v_claimed_at
    );
  exception
    when unique_violation then
      if exists(select 1 from os2_reentry_v01.atomic_commit_receipts where authority_key = v_authority_key) then
        return jsonb_build_object('status','ALREADY_CONSUMED');
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
