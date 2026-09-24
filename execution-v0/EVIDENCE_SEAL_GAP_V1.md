# EVIDENCE SEAL GAP V1

Current evidence architecture has deterministic SHA-256 packets in common_memory.phase_audit_packets and read-only auditor access, but the packet table itself remains mutable by postgres and has no append-only trigger. This is authenticated evidence, not an independently sealed evidence store.

Observed controls:
- phase_audit_packets stores evidence_hash_sha256, authenticator, authentication_verified, logic_auditor.
- Existing packets report POSTGRES_DETERMINISTIC_VERIFIER and authentication_verified=true.
- common_memory_sora_auditor has SELECT only.
- postgres retains INSERT/UPDATE/DELETE/TRUNCATE.
- No non-internal trigger currently protects phase_audit_packets or phase_audit_verdicts.

Implementation-complete requirement:
1. Canonical evidence serialization version must be explicit.
2. Hash must be generated from that canonical representation.
3. Packet must become append-only after insert.
4. Independent seal/root must be stored outside the same mutable trust domain, or status must remain NOT_INDEPENDENTLY_SEALED.
5. Recount must verify packet hash + external seal + lineage.

Do not use the invalid historical MEMORY RECOVERY baseline hash as a trust anchor.
