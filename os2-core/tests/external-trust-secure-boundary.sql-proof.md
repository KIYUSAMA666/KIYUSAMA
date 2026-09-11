# External Trust Secure Boundary v0.1 — live proof scope

Live Supabase verification target: project `zdypjilutgxjsneultqj`.

The durable migration `os2_external_trust_secure_boundary_v01` was applied before PR creation.

Verified by SORA against the live database:
- service_role has no direct SELECT/UPDATE privilege on `os2_external_trust_v01.trust_boundary`.
- service_role has no EXECUTE on `provision_root_pin`.
- service_role has EXECUTE on `read_trust_boundary` and `advance_revocation_watermark`.
- anon/authenticated have no schema USAGE.
- root re-pin with a different SHA-256 fingerprint returns `HOLD / ROOT_PIN_IMMUTABLE`.
- revocation watermark advance 0 → 7 succeeds and increments generation 1 → 2.
- lower watermark returns `HOLD / REVOCATION_ROLLBACK`.
- stale generation returns `HOLD / GENERATION_CONFLICT`.
- all live test rows were deleted after verification; remaining test rows = 0.

KIRA should independently repeat privilege and rollback/race attacks against the live database and audit the exact PR head before merge.
