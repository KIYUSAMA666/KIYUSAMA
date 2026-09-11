# External Trust Watermark Authentication Hotfix v0.1 — Live Supabase Proof

Project: `zdypjilutgxjsneultqj`

SORA primary verification executed against the live Supabase/Postgres project after applying the hotfix migration.

Verified facts:

- `pgsodium` is installed and `crypto_sign_verify_detached(bytea,bytea,bytea)` is available.
- A deterministic test Ed25519 keypair was created only inside a transaction-scoped test context.
- `provision_root_pin_v2` bound the raw 32-byte Ed25519 public key to the immutable SHA-256 fingerprint of its RFC 8410 SPKI DER representation.
- With `SET LOCAL ROLE service_role`, a valid root-signed revocation snapshot advanced watermark `0 -> 7` and generation `1 -> 2`.
- A corrupted 64-byte signature was rejected with `HOLD / REVOCATION_SIGNATURE_INVALID`.
- A root-identity substitution was rejected with `HOLD / REVOCATION_ROOT_MISMATCH`.
- `service_role` has no direct SELECT / UPDATE / DELETE privilege on `trust_boundary`.
- `service_role` cannot call `provision_root_pin_v2`.
- `service_role` cannot call the legacy bare-integer `advance_revocation_watermark` entry point.
- `service_role` can call only `advance_revocation_watermark_authenticated` for runtime advancement.
- A forged huge-sequence attempt did not change the trusted boundary; after a valid sequence 7 update the boundary remained sequence 7 / generation 2.
- All test rows were transaction-scoped and rolled back; a post-test query confirmed zero `HOTFIX-%` rows remained.

Scope note: this proves authenticated watermark persistence and signature-gated runtime advancement in the tested Supabase/Postgres integration. It does not prove production custody of the external root private key in an HSM/KMS.
