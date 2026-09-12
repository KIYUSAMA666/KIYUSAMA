-- KIYUSAMA OS 2.0
-- RE-ENTRY RESOLUTION STORAGE ATOMIC v0.1
-- Durable UNKNOWN closure and resolution receipt write must share one PostgreSQL transaction.

create table if not exists os2_reentry_v01.unknown_outcomes (
  authority_key text primary key,
  record_version text not null,
  lease_id text not null,
  action_id text not null,
  state_id text not null,
  state_revision bigint not null check (state_revision >= 0),
  commit_sequence bigint not null check (commit_sequence >= 0),
  result_id text not null,
  handoff_id text not null,
  reason text not null check (reason in ('RECEIPT_NOT_FOUND','RECEIPT_BACKEND_FAILURE')),
  observed_at timestamptz not null,
  consumed_at timestamptz null
);

create table if not exists os2_reentry_v01.resolution_receipts (
  authority_key text primary key,
  receipt_version text not null,
  lease_id text not null,
  action_id text not null,
  state_id text not null,
  state_revision bigint not null check (state_revision >= 0),
  commit_sequence bigint not null check (commit_sequence >= 0),
  result_id text not null,
  handoff_id text not null,
  unknown_observed_at timestamptz not null,
  finalized_at timestamptz not null,
  check (finalized_at >= unknown_observed_at)
);

create unique index if not exists unknown_outcomes_binding_uq
  on os2_reentry_v01.unknown_outcomes
  (lease_id, action_id, state_id, state_revision, commit_sequence, result_id, handoff_id, observed_at);

create unique index if not exists resolution_receipts_binding_uq
  on os2_reentry_v01.resolution_receipts
  (lease_id, action_id, state_id, state_revision, commit_sequence, result_id, handoff_id, unknown_observed_at, finalized_at);

create or replace function public.os2_reentry_close_unknown_with_resolution_receipt(p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, os2_reentry_v01
as $$
declare
  v_authority_key text := nullif(btrim(p_input->>'authorityKey'), '');
  v_record_version text := nullif(btrim(p_input->>'recordVersion'), '');
  v_receipt_version text := nullif(btrim(p_input->>'receiptVersion'), '');
  v_lease_id text := nullif(btrim(p_input->>'leaseId'), '');
  v_action_id text := nullif(btrim(p_input->>'actionId'), '');
  v_state_id text := nullif(btrim(p_input->>'stateId'), '');
  v_result_id text := nullif(btrim(p_input->>'resultId'), '');
  v_handoff_id text := nullif(btrim(p_input->>'handoffId'), '');
  v_state_revision bigint;
  v_commit_sequence bigint;
  v_unknown_observed_at timestamptz;
  v_finalized_at timestamptz;
  v_unknown os2_reentry_v01.unknown_outcomes%rowtype;
  v_receipt os2_reentry_v01.resolution_receipts%rowtype;
begin
  if jsonb_typeof(p_input) <> 'object' then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  begin
    v_state_revision := (p_input->>'stateRevision')::bigint;
    v_commit_sequence := (p_input->>'commitSequence')::bigint;
    v_unknown_observed_at := (p_input->>'unknownObservedAt')::timestamptz;
    v_finalized_at := (p_input->>'finalizedAt')::timestamptz;
  exception when others then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end;

  if v_authority_key is null or v_record_version is null or v_receipt_version is null
     or v_lease_id is null or v_action_id is null or v_state_id is null
     or v_result_id is null or v_handoff_id is null
     or v_state_revision < 0 or v_commit_sequence < 0
     or v_finalized_at < v_unknown_observed_at then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  select * into v_unknown
    from os2_reentry_v01.unknown_outcomes
   where authority_key = v_authority_key
   for update;

  if not found then
    select * into v_receipt
      from os2_reentry_v01.resolution_receipts
     where authority_key = v_authority_key;

    if found
       and v_receipt.receipt_version = v_receipt_version
       and v_receipt.lease_id = v_lease_id
       and v_receipt.action_id = v_action_id
       and v_receipt.state_id = v_state_id
       and v_receipt.state_revision = v_state_revision
       and v_receipt.commit_sequence = v_commit_sequence
       and v_receipt.result_id = v_result_id
       and v_receipt.handoff_id = v_handoff_id
       and v_receipt.unknown_observed_at = v_unknown_observed_at
       and v_receipt.finalized_at = v_finalized_at then
      return jsonb_build_object('status','ALREADY_RESOLVED');
    end if;

    return jsonb_build_object('status','NOT_FOUND');
  end if;

  if v_unknown.record_version <> v_record_version
     or v_unknown.lease_id <> v_lease_id
     or v_unknown.action_id <> v_action_id
     or v_unknown.state_id <> v_state_id
     or v_unknown.state_revision <> v_state_revision
     or v_unknown.commit_sequence <> v_commit_sequence
     or v_unknown.result_id <> v_result_id
     or v_unknown.handoff_id <> v_handoff_id
     or v_unknown.observed_at <> v_unknown_observed_at
     or v_unknown.consumed_at is not null then
    return jsonb_build_object('status','BINDING_MISMATCH');
  end if;

  begin
    insert into os2_reentry_v01.resolution_receipts(
      authority_key, receipt_version, lease_id, action_id, state_id,
      state_revision, commit_sequence, result_id, handoff_id,
      unknown_observed_at, finalized_at
    ) values (
      v_authority_key, v_receipt_version, v_lease_id, v_action_id, v_state_id,
      v_state_revision, v_commit_sequence, v_result_id, v_handoff_id,
      v_unknown_observed_at, v_finalized_at
    );

    update os2_reentry_v01.unknown_outcomes
       set consumed_at = v_finalized_at
     where authority_key = v_authority_key
       and consumed_at is null;

    if not found then
      raise exception using errcode = 'P0001', message = 'UNKNOWN_CHANGED_DURING_RESOLUTION';
    end if;
  exception
    when unique_violation then
      select * into v_receipt
        from os2_reentry_v01.resolution_receipts
       where authority_key = v_authority_key;
      if found
         and v_receipt.receipt_version = v_receipt_version
         and v_receipt.lease_id = v_lease_id
         and v_receipt.action_id = v_action_id
         and v_receipt.state_id = v_state_id
         and v_receipt.state_revision = v_state_revision
         and v_receipt.commit_sequence = v_commit_sequence
         and v_receipt.result_id = v_result_id
         and v_receipt.handoff_id = v_handoff_id
         and v_receipt.unknown_observed_at = v_unknown_observed_at
         and v_receipt.finalized_at = v_finalized_at then
        return jsonb_build_object('status','ALREADY_RESOLVED');
      end if;
      return jsonb_build_object('status','BINDING_MISMATCH');
    when others then
      return jsonb_build_object('status','BACKEND_FAILURE');
  end;

  return jsonb_build_object('status','RESOLVED');
end;
$$;

revoke all on function public.os2_reentry_close_unknown_with_resolution_receipt(jsonb) from public, anon, authenticated;
grant execute on function public.os2_reentry_close_unknown_with_resolution_receipt(jsonb) to service_role;
