-- KIYUSAMA OS 2.0
-- EXTERNAL TRUST SECURE BOUNDARY v0.1
--
-- Durable trusted storage for the externally provisioned root fingerprint and the
-- monotonic minimum revocation sequence. Runtime service_role may READ the pin and
-- ADVANCE (never lower) the watermark, but it cannot provision/replace a root pin or
-- directly mutate the underlying table. Root provisioning is deliberately reserved
-- for the database-owner/admin channel and is therefore outside normal runtime RPC.

create schema if not exists os2_external_trust_v01;

revoke all on schema os2_external_trust_v01 from public, anon, authenticated;
grant usage on schema os2_external_trust_v01 to service_role;

create table if not exists os2_external_trust_v01.trust_boundary (
  root_id text not null check (length(btrim(root_id)) > 0),
  root_version text not null check (length(btrim(root_version)) > 0),
  root_fingerprint_sha256 text not null
    check (root_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  min_revocation_sequence bigint not null default 0 check (min_revocation_sequence >= 0),
  generation bigint not null default 1 check (generation >= 1),
  provisioning_evidence_id text not null check (length(btrim(provisioning_evidence_id)) > 0),
  provisioned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (root_id, root_version)
);

-- Runtime principals receive NO table privileges. All access crosses the functions below.
revoke all on table os2_external_trust_v01.trust_boundary
  from public, anon, authenticated, service_role;

create or replace function os2_external_trust_v01.provision_root_pin(
  p_root_id text,
  p_root_version text,
  p_root_fingerprint_sha256 text,
  p_provisioning_evidence_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, os2_external_trust_v01
as $$
declare
  v_root_id text := nullif(btrim(p_root_id), '');
  v_root_version text := nullif(btrim(p_root_version), '');
  v_fingerprint text := lower(nullif(btrim(p_root_fingerprint_sha256), ''));
  v_evidence_id text := nullif(btrim(p_provisioning_evidence_id), '');
  v_existing os2_external_trust_v01.trust_boundary%rowtype;
begin
  if v_root_id is null
     or v_root_version is null
     or v_fingerprint is null
     or v_fingerprint !~ '^[0-9a-f]{64}$'
     or v_evidence_id is null then
    return jsonb_build_object('status','HOLD','reason','INVALID_TRUST_BOUNDARY_INPUT');
  end if;

  select * into v_existing
    from os2_external_trust_v01.trust_boundary
   where root_id = v_root_id and root_version = v_root_version
   for update;

  if found then
    if v_existing.root_fingerprint_sha256 <> v_fingerprint then
      return jsonb_build_object('status','HOLD','reason','ROOT_PIN_IMMUTABLE');
    end if;

    -- Exact re-provision of the same pin is idempotent. Original evidence/timestamps remain.
    return jsonb_build_object(
      'status','PROVISIONED',
      'boundary',jsonb_build_object(
        'rootId',v_existing.root_id,
        'rootVersion',v_existing.root_version,
        'rootFingerprintSha256',v_existing.root_fingerprint_sha256,
        'minRevocationSequence',v_existing.min_revocation_sequence,
        'generation',v_existing.generation,
        'provisioningEvidenceId',v_existing.provisioning_evidence_id,
        'provisionedAt',v_existing.provisioned_at,
        'updatedAt',v_existing.updated_at
      )
    );
  end if;

  insert into os2_external_trust_v01.trust_boundary(
    root_id, root_version, root_fingerprint_sha256, provisioning_evidence_id
  ) values (
    v_root_id, v_root_version, v_fingerprint, v_evidence_id
  ) returning * into v_existing;

  return jsonb_build_object(
    'status','PROVISIONED',
    'boundary',jsonb_build_object(
      'rootId',v_existing.root_id,
      'rootVersion',v_existing.root_version,
      'rootFingerprintSha256',v_existing.root_fingerprint_sha256,
      'minRevocationSequence',v_existing.min_revocation_sequence,
      'generation',v_existing.generation,
      'provisioningEvidenceId',v_existing.provisioning_evidence_id,
      'provisionedAt',v_existing.provisioned_at,
      'updatedAt',v_existing.updated_at
    )
  );
end;
$$;

-- Provisioning is intentionally NOT callable by service_role/runtime.
revoke all on function os2_external_trust_v01.provision_root_pin(text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function os2_external_trust_v01.provision_root_pin(text,text,text,text) to postgres;

create or replace function os2_external_trust_v01.read_trust_boundary(
  p_root_id text,
  p_root_version text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, os2_external_trust_v01
as $$
declare
  v_row os2_external_trust_v01.trust_boundary%rowtype;
begin
  select * into v_row
    from os2_external_trust_v01.trust_boundary
   where root_id = nullif(btrim(p_root_id), '')
     and root_version = nullif(btrim(p_root_version), '');

  if not found then
    return jsonb_build_object('status','HOLD','reason','ROOT_PIN_NOT_FOUND');
  end if;

  return jsonb_build_object(
    'status','LOADED',
    'boundary',jsonb_build_object(
      'rootId',v_row.root_id,
      'rootVersion',v_row.root_version,
      'rootFingerprintSha256',v_row.root_fingerprint_sha256,
      'minRevocationSequence',v_row.min_revocation_sequence,
      'generation',v_row.generation,
      'provisioningEvidenceId',v_row.provisioning_evidence_id,
      'provisionedAt',v_row.provisioned_at,
      'updatedAt',v_row.updated_at
    )
  );
end;
$$;

revoke all on function os2_external_trust_v01.read_trust_boundary(text,text)
  from public, anon, authenticated;
grant execute on function os2_external_trust_v01.read_trust_boundary(text,text) to service_role;

create or replace function os2_external_trust_v01.advance_revocation_watermark(
  p_root_id text,
  p_root_version text,
  p_expected_generation bigint,
  p_new_min_revocation_sequence bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, os2_external_trust_v01
as $$
declare
  v_row os2_external_trust_v01.trust_boundary%rowtype;
begin
  if nullif(btrim(p_root_id), '') is null
     or nullif(btrim(p_root_version), '') is null
     or p_expected_generation is null or p_expected_generation < 1
     or p_new_min_revocation_sequence is null or p_new_min_revocation_sequence < 0 then
    return jsonb_build_object('status','HOLD','reason','INVALID_TRUST_BOUNDARY_INPUT');
  end if;

  select * into v_row
    from os2_external_trust_v01.trust_boundary
   where root_id = btrim(p_root_id)
     and root_version = btrim(p_root_version)
   for update;

  if not found then
    return jsonb_build_object('status','HOLD','reason','ROOT_PIN_NOT_FOUND');
  end if;

  if v_row.generation <> p_expected_generation then
    return jsonb_build_object('status','HOLD','reason','GENERATION_CONFLICT');
  end if;

  if p_new_min_revocation_sequence < v_row.min_revocation_sequence then
    return jsonb_build_object('status','HOLD','reason','REVOCATION_ROLLBACK');
  end if;

  if p_new_min_revocation_sequence > v_row.min_revocation_sequence then
    update os2_external_trust_v01.trust_boundary
       set min_revocation_sequence = p_new_min_revocation_sequence,
           generation = generation + 1,
           updated_at = now()
     where root_id = v_row.root_id and root_version = v_row.root_version
     returning * into v_row;
  end if;

  return jsonb_build_object(
    'status','ADVANCED',
    'boundary',jsonb_build_object(
      'rootId',v_row.root_id,
      'rootVersion',v_row.root_version,
      'rootFingerprintSha256',v_row.root_fingerprint_sha256,
      'minRevocationSequence',v_row.min_revocation_sequence,
      'generation',v_row.generation,
      'provisioningEvidenceId',v_row.provisioning_evidence_id,
      'provisionedAt',v_row.provisioned_at,
      'updatedAt',v_row.updated_at
    )
  );
end;
$$;

revoke all on function os2_external_trust_v01.advance_revocation_watermark(text,text,bigint,bigint)
  from public, anon, authenticated;
grant execute on function os2_external_trust_v01.advance_revocation_watermark(text,text,bigint,bigint)
  to service_role;
