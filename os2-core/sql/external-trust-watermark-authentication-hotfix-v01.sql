-- KIYUSAMA OS 2.0
-- WATERMARK ADVANCEMENT AUTHENTICATION HOTFIX v0.1
--
-- Closes the remaining fail-closed permanent-DoS path in External Trust Secure Boundary v0.1.
-- A runtime caller can no longer advance min_revocation_sequence with a bare integer.
-- The new watermark must come from an exact root-signed revocation snapshot payload.

create extension if not exists pgsodium;

grant execute on function pgsodium.crypto_sign_verify_detached(bytea, bytea, bytea) to postgres;

alter table os2_external_trust_v01.trust_boundary
  add column if not exists root_public_key_ed25519 bytea;

alter table os2_external_trust_v01.trust_boundary
  drop constraint if exists trust_boundary_root_public_key_ed25519_check;

alter table os2_external_trust_v01.trust_boundary
  add constraint trust_boundary_root_public_key_ed25519_check
  check (root_public_key_ed25519 is null or octet_length(root_public_key_ed25519) = 32);

-- The original provisioning entry point cannot bind the public key required to authenticate
-- revocation evidence. Disable it so new pins cannot be created in an incomplete state.
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
begin
  return jsonb_build_object('status','HOLD','reason','ROOT_PUBLIC_KEY_REQUIRED');
end;
$$;

revoke all on function os2_external_trust_v01.provision_root_pin(text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function os2_external_trust_v01.provision_root_pin(text,text,text,text) to postgres;

create or replace function os2_external_trust_v01.provision_root_pin_v2(
  p_root_id text,
  p_root_version text,
  p_root_fingerprint_sha256 text,
  p_root_public_key_base64 text,
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
  v_public_key bytea;
  v_spki_der bytea;
  v_actual_fingerprint text;
  v_evidence_id text := nullif(btrim(p_provisioning_evidence_id), '');
  v_existing os2_external_trust_v01.trust_boundary%rowtype;
begin
  begin
    v_public_key := decode(nullif(btrim(p_root_public_key_base64), ''), 'base64');
  exception when others then
    return jsonb_build_object('status','HOLD','reason','INVALID_TRUST_BOUNDARY_INPUT');
  end;

  if v_root_id is null
     or v_root_version is null
     or v_fingerprint is null
     or v_fingerprint !~ '^[0-9a-f]{64}$'
     or v_public_key is null
     or octet_length(v_public_key) <> 32
     or v_evidence_id is null then
    return jsonb_build_object('status','HOLD','reason','INVALID_TRUST_BOUNDARY_INPUT');
  end if;

  -- RFC 8410 Ed25519 SubjectPublicKeyInfo prefix + raw 32-byte public key.
  v_spki_der := decode('302a300506032b6570032100', 'hex') || v_public_key;
  v_actual_fingerprint := encode(extensions.digest(v_spki_der, 'sha256'), 'hex');
  if v_actual_fingerprint <> v_fingerprint then
    return jsonb_build_object('status','HOLD','reason','ROOT_FINGERPRINT_MISMATCH');
  end if;

  select * into v_existing
    from os2_external_trust_v01.trust_boundary
   where root_id = v_root_id and root_version = v_root_version
   for update;

  if found then
    if v_existing.root_fingerprint_sha256 <> v_fingerprint then
      return jsonb_build_object('status','HOLD','reason','ROOT_PIN_IMMUTABLE');
    end if;
    if v_existing.root_public_key_ed25519 is not null
       and v_existing.root_public_key_ed25519 <> v_public_key then
      return jsonb_build_object('status','HOLD','reason','ROOT_PIN_IMMUTABLE');
    end if;

    -- One-time safe completion of a pre-hotfix row: the public key may be attached only
    -- when it hashes to the already immutable fingerprint.
    if v_existing.root_public_key_ed25519 is null then
      update os2_external_trust_v01.trust_boundary
         set root_public_key_ed25519 = v_public_key,
             updated_at = now()
       where root_id = v_existing.root_id and root_version = v_existing.root_version
       returning * into v_existing;
    end if;
  else
    insert into os2_external_trust_v01.trust_boundary(
      root_id,
      root_version,
      root_fingerprint_sha256,
      root_public_key_ed25519,
      provisioning_evidence_id
    ) values (
      v_root_id,
      v_root_version,
      v_fingerprint,
      v_public_key,
      v_evidence_id
    ) returning * into v_existing;
  end if;

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

revoke all on function os2_external_trust_v01.provision_root_pin_v2(text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function os2_external_trust_v01.provision_root_pin_v2(text,text,text,text,text) to postgres;

-- Disable the bare-integer runtime entry point. Keeping the signature but always failing
-- closed prevents accidental callers from silently retaining the old unsafe behavior.
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
begin
  return jsonb_build_object('status','HOLD','reason','AUTHENTICATED_REVOCATION_REQUIRED');
end;
$$;

revoke all on function os2_external_trust_v01.advance_revocation_watermark(text,text,bigint,bigint)
  from public, anon, authenticated, service_role;

create or replace function os2_external_trust_v01.advance_revocation_watermark_authenticated(
  p_root_id text,
  p_root_version text,
  p_expected_generation bigint,
  p_signed_payload text,
  p_signature_base64 text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, os2_external_trust_v01, pgsodium
as $$
declare
  v_row os2_external_trust_v01.trust_boundary%rowtype;
  v_payload jsonb;
  v_snapshot_id text;
  v_payload_root_id text;
  v_payload_root_version text;
  v_sequence bigint;
  v_issued_at timestamptz;
  v_expires_at timestamptz;
  v_signature bytea;
begin
  if nullif(btrim(p_root_id), '') is null
     or nullif(btrim(p_root_version), '') is null
     or p_expected_generation is null or p_expected_generation < 1
     or nullif(p_signed_payload, '') is null
     or nullif(btrim(p_signature_base64), '') is null then
    return jsonb_build_object('status','HOLD','reason','INVALID_TRUST_BOUNDARY_INPUT');
  end if;

  begin
    v_payload := p_signed_payload::jsonb;
    v_snapshot_id := nullif(btrim(v_payload->>'snapshotId'), '');
    v_payload_root_id := nullif(btrim(v_payload->>'rootId'), '');
    v_payload_root_version := nullif(btrim(v_payload->>'rootVersion'), '');
    v_sequence := (v_payload->>'sequence')::bigint;
    v_issued_at := (v_payload->>'issuedAt')::timestamptz;
    v_expires_at := (v_payload->>'expiresAt')::timestamptz;
    v_signature := decode(p_signature_base64, 'base64');
  exception when others then
    return jsonb_build_object('status','HOLD','reason','REVOCATION_EVIDENCE_INVALID');
  end;

  if v_snapshot_id is null
     or v_payload_root_id is null
     or v_payload_root_version is null
     or v_sequence is null or v_sequence < 1
     or v_issued_at is null or v_expires_at is null or v_expires_at <= v_issued_at
     or jsonb_typeof(v_payload->'revokedProofKeyIds') <> 'array'
     or v_signature is null or octet_length(v_signature) <> 64 then
    return jsonb_build_object('status','HOLD','reason','REVOCATION_EVIDENCE_INVALID');
  end if;

  if v_payload_root_id <> btrim(p_root_id)
     or v_payload_root_version <> btrim(p_root_version) then
    return jsonb_build_object('status','HOLD','reason','REVOCATION_ROOT_MISMATCH');
  end if;

  if now() < v_issued_at or now() > v_expires_at then
    return jsonb_build_object('status','HOLD','reason','REVOCATION_NOT_FRESH');
  end if;

  select * into v_row
    from os2_external_trust_v01.trust_boundary
   where root_id = btrim(p_root_id)
     and root_version = btrim(p_root_version)
   for update;

  if not found then
    return jsonb_build_object('status','HOLD','reason','ROOT_PIN_NOT_FOUND');
  end if;

  if v_row.root_public_key_ed25519 is null or octet_length(v_row.root_public_key_ed25519) <> 32 then
    return jsonb_build_object('status','HOLD','reason','ROOT_PUBLIC_KEY_REQUIRED');
  end if;

  if v_row.generation <> p_expected_generation then
    return jsonb_build_object('status','HOLD','reason','GENERATION_CONFLICT');
  end if;

  if not pgsodium.crypto_sign_verify_detached(
    v_signature,
    convert_to(p_signed_payload, 'UTF8'),
    v_row.root_public_key_ed25519
  ) then
    return jsonb_build_object('status','HOLD','reason','REVOCATION_SIGNATURE_INVALID');
  end if;

  if v_sequence < v_row.min_revocation_sequence then
    return jsonb_build_object('status','HOLD','reason','REVOCATION_ROLLBACK');
  end if;

  if v_sequence > v_row.min_revocation_sequence then
    update os2_external_trust_v01.trust_boundary
       set min_revocation_sequence = v_sequence,
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
    ),
    'authenticatedSnapshotId',v_snapshot_id
  );
exception when others then
  raise;
end;
$$;

revoke all on function os2_external_trust_v01.advance_revocation_watermark_authenticated(text,text,bigint,text,text)
  from public, anon, authenticated;
grant execute on function os2_external_trust_v01.advance_revocation_watermark_authenticated(text,text,bigint,text,text)
  to service_role;
