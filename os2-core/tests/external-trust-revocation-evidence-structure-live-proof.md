# Revocation Evidence Structure Hotfix v0.1 — SORA live proof

Target Supabase project: `zdypjilutgxjsneultqj`.

This proof was intentionally run inside one explicit PostgreSQL transaction and rolled back. The production function was transaction-locally replaced with the proposed hotfix, a real Ed25519 keypair was generated, the root pin was provisioned only inside the transaction, and calls were made under `SET LOCAL ROLE service_role`.

Signed malformed snapshots tested before any valid advancement:

- duplicate IDs: `revokedProofKeyIds=["KEY-X","KEY-X"]`
- blank ID: `revokedProofKeyIds=["KEY-X",""]`
- non-string ID: `revokedProofKeyIds=["KEY-X",42]`

All three calls occurred with expected generation `1`. A subsequent correctly signed valid snapshot, also using expected generation `1`, successfully advanced the boundary to sequence `10`, generation `2`. Therefore none of the malformed signed snapshots advanced generation or watermark.

After `ROLLBACK`, a separate production query confirmed `0` rows remained for root `STRUCT-HOTFIX-ROOT`.

Important scope note: the migration in this PR has **not** been durably applied by this proof. The live test proves the proposed function behavior transaction-locally without altering the durable production function. KIRA should independently execute the signed malformed cases and verify the exact HOLD reason before merge/apply.
