-- KIYUSAMA OS 2.0
-- REVOCATION EVIDENCE STRUCTURE HOTFIX v0.1
--
-- Closes the remaining semantic mismatch between the database watermark boundary and
-- evaluateExternalTrustRoot(). A root-signed snapshot may advance the watermark only
-- if every revokedProofKeyIds element is a non-empty string and no exact ID is duplicated.

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

  -- Match evaluateExternalTrustRoot() semantics: each ID must be a non-empty string.
  if exists (
    select 1
      from jsonb_array_elements(v_payload->'revokedProofKeyIds') as elem(value)
     where jsonb_typeof(elem.value) <> 'string'
        or nullif(btrim(elem.value #>> '{}'), '') is null
  ) then
    return jsonb_build_object('status','HOLD','reason','REVOCATION_EVIDENCE_INVALID');
  end if;

  -- Exact duplicate IDs are invalid. Whitespace is significant for duplicate identity,
  -- matching the TypeScript Set<string> check; trimming is used only for emptiness.
  if exists (
    select 1
      from (
        select elem.value #>> '{}' as proof_key_id, count(*) as occurrences
          from jsonb_array_elements(v_payload->'revokedProofKeyIds') as elem(value)
         group by elem.value #>> '{}'
        having count(*) > 1
      ) duplicated
  ) then
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
