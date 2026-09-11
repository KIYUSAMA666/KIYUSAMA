// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  canonicalDelegationPayload,
  canonicalRevocationPayload,
  publicKeyFingerprintSha256,
} from "../src/external-trust-root.js";
import {
  canonicalProvenanceAttestationPayload,
  canonicalTrustAnchorRegistryPayload,
  deriveRequiredProvenanceSubjects,
  evaluateProvenanceVerification,
} from "../src/trust-anchor-provenance.js";

const NOW = "2026-09-11T08:30:00+09:00";
const PROOF_TYPE = "ED25519-PROVENANCE-V1";

function pair() { return generateKeyPairSync("ed25519"); }
function pem(key) { return key.export({ type: "spki", format: "pem" }).toString(); }
function sig(privateKey, payload) { return sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64"); }

function current() {
  return {
    identity: { stateId: "CS-MAIN", schemaVersion: "0.1", stateRevision: 12, effectiveAt: "2026-09-11T08:00:00+09:00", scope: "KIYUSAMA_OS_2", lineageId: "LINEAGE-MAIN-001" },
    humanDecisionFinal: { decisionId: "HD-1", sourceAuthority: "KIYUSAMA", shortDirective: "test" },
    mainLineTask: { taskId: "ML-1", description: "test" },
    nextActionSingle: { actionId: "NA-1", description: "test" },
    activeRolesAndAuthority: { EVIDENCE_AUTHORITY: "AUTH-EVIDENCE-1", LANE_AUTHORITY: "AUTH-LANE-1", IDENTITY_AUTHORITY: "AUTH-IDENTITY-1" },
    activeGuards: [],
    confirmedRefIndex: [
      { id: "REF-1", status: "VERIFIED", expectedVersion: "v7", path: "evidence/ref-1.json" },
      { id: "REF-UNVERIFIED", status: "UNVERIFIED_REF", expectedVersion: null, path: null },
    ],
    independentLaneHealth: { status: "VERIFIED", evidenceVerdict: "SUFFICIENT", observedAt: "2026-09-11T08:20:00+09:00", evidenceSource: "KIRA-INDEPENDENT" },
  };
}

function result() {
  return {
    resultId: "RESULT-1", handoffId: "HANDOFF-1", traceId: "TRACE-1", actionId: "ACTION-1",
    sourceStateId: "CS-MAIN", sourceStateRevision: 12, capabilityId: "CAP-1", implementationId: "IMPL-1",
    executorId: "EXECUTOR-1", verifierId: "KIRA-INDEPENDENT", outcome: "SUCCEEDED", providerExecutionId: "PROVIDER-1",
    observedAt: "2026-09-11T08:25:00+09:00", evidenceRefIds: ["REF-1"], verification: "VERIFIED",
  };
}

function anchors() {
  return [
    { anchorId: "ANCHOR-EVIDENCE", anchorVersion: "1", subjectKind: "EVIDENCE_REF", authorityRole: "EVIDENCE_AUTHORITY", authorityId: "AUTH-EVIDENCE-1", status: "ACTIVE", validFrom: "2026-09-01T00:00:00+09:00", validUntil: null },
    { anchorId: "ANCHOR-LANE", anchorVersion: "1", subjectKind: "INDEPENDENT_LANE", authorityRole: "LANE_AUTHORITY", authorityId: "AUTH-LANE-1", status: "ACTIVE", validFrom: "2026-09-01T00:00:00+09:00", validUntil: null },
    { anchorId: "ANCHOR-IDENTITY", anchorVersion: "1", subjectKind: "VERIFIER_IDENTITY", authorityRole: "IDENTITY_AUTHORITY", authorityId: "AUTH-IDENTITY-1", status: "ACTIVE", validFrom: "2026-09-01T00:00:00+09:00", validUntil: null },
  ];
}

function subject(kind, id, version = null, path = null) {
  return { subjectKind: kind, subjectId: id, subjectVersion: version, subjectPath: path, stateId: "CS-MAIN", stateRevision: 12, lineageId: "LINEAGE-MAIN-001" };
}

function fixture() {
  const rootPair = pair();
  const rootPem = pem(rootPair.publicKey);
  const root = { rootId: "ROOT-1", rootVersion: "1", algorithm: "ED25519", publicKeyPem: rootPem, validFrom: "2026-09-01T00:00:00+09:00", validUntil: null };

  const proofPairs = {
    "AUTH-EVIDENCE-1": pair(),
    "AUTH-LANE-1": pair(),
    "AUTH-IDENTITY-1": pair(),
  };

  const keyDefs = [
    ["PROOF-EVIDENCE", "AUTH-EVIDENCE-1"],
    ["PROOF-LANE", "AUTH-LANE-1"],
    ["PROOF-IDENTITY", "AUTH-IDENTITY-1"],
  ].map(([proofKeyId, authority]) => {
    const publicKeyPem = pem(proofPairs[authority].publicKey);
    const key = {
      proofKeyId,
      rootId: "ROOT-1",
      rootVersion: "1",
      issuerAuthorityId: authority,
      proofType: PROOF_TYPE,
      algorithm: "ED25519",
      publicKeyPem,
      publicKeyFingerprintSha256: publicKeyFingerprintSha256(publicKeyPem),
      validFrom: "2026-09-01T00:00:00+09:00",
      validUntil: null,
      delegationSignatureBase64: "",
    };
    key.delegationSignatureBase64 = sig(rootPair.privateKey, canonicalDelegationPayload(key));
    return key;
  });

  const revocation = { snapshotId: "REV-20", rootId: "ROOT-1", rootVersion: "1", sequence: 20, issuedAt: "2026-09-11T08:00:00+09:00", expiresAt: "2026-09-11T09:00:00+09:00", revokedProofKeyIds: [], signatureBase64: "" };
  revocation.signatureBase64 = sig(rootPair.privateKey, canonicalRevocationPayload(revocation));

  const registry = { registryId: "REGISTRY-1", registryRevision: 3, anchors: anchors(), rootSignatureBase64: "" };
  registry.rootSignatureBase64 = sig(rootPair.privateKey, canonicalTrustAnchorRegistryPayload(registry));

  const attestations = [
    { attestationId: "ATT-EVIDENCE", anchorId: "ANCHOR-EVIDENCE", anchorVersion: "1", issuerAuthorityId: "AUTH-EVIDENCE-1", subject: subject("EVIDENCE_REF", "REF-1", "v7", "evidence/ref-1.json"), issuedAt: "2026-09-11T08:10:00+09:00", expiresAt: "2026-09-11T08:50:00+09:00", proofType: PROOF_TYPE, proofKeyId: "PROOF-EVIDENCE", proofValue: "" },
    { attestationId: "ATT-LANE", anchorId: "ANCHOR-LANE", anchorVersion: "1", issuerAuthorityId: "AUTH-LANE-1", subject: subject("INDEPENDENT_LANE", "KIRA-INDEPENDENT"), issuedAt: "2026-09-11T08:10:00+09:00", expiresAt: "2026-09-11T08:50:00+09:00", proofType: PROOF_TYPE, proofKeyId: "PROOF-LANE", proofValue: "" },
    { attestationId: "ATT-IDENTITY", anchorId: "ANCHOR-IDENTITY", anchorVersion: "1", issuerAuthorityId: "AUTH-IDENTITY-1", subject: subject("VERIFIER_IDENTITY", "KIRA-INDEPENDENT"), issuedAt: "2026-09-11T08:10:00+09:00", expiresAt: "2026-09-11T08:50:00+09:00", proofType: PROOF_TYPE, proofKeyId: "PROOF-IDENTITY", proofValue: "" },
  ];
  for (const a of attestations) a.proofValue = sig(proofPairs[a.issuerAuthorityId].privateKey, canonicalProvenanceAttestationPayload(a));

  const input = {
    current: current(),
    result: result(),
    registry,
    attestations,
    externalTrust: {
      root,
      expectedRootFingerprintSha256: publicKeyFingerprintSha256(rootPem),
      delegatedProofKeys: keyDefs,
      revocationSnapshot: revocation,
      minRevocationSequence: 20,
      now: NOW,
    },
    now: NOW,
  };

  return { input, rootPair, proofPairs, revocation, registry };
}

function resignRegistry(f) {
  f.input.registry.rootSignatureBase64 = sig(f.rootPair.privateKey, canonicalTrustAnchorRegistryPayload(f.input.registry));
}

function resignAttestation(f, index) {
  const a = f.input.attestations[index];
  a.proofValue = sig(f.proofPairs[a.issuerAuthorityId].privateKey, canonicalProvenanceAttestationPayload(a));
}

test("1 normal result provenance verifies through external trust root", () => {
  const f = fixture();
  const d = evaluateProvenanceVerification(f.input);
  assert.equal(d.status, "VERIFIED");
  assert.equal(d.verified.length, 3);
  assert.equal(d.externalTrust.revocationSequence, 20);
});

test("2 requirements remain internally derived", () => {
  assert.deepEqual(deriveRequiredProvenanceSubjects({ current: current(), result: result() }), { evidenceRefIds: ["REF-1"], requireIndependentLane: true, verifierId: "KIRA-INDEPENDENT" });
});

test("3 substituted external root is HOLD", () => {
  const f = fixture();
  f.input.externalTrust.root.publicKeyPem = pem(pair().publicKey);
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "EXTERNAL_TRUST_NOT_VERIFIED" });
});

test("4 unsigned registry mutation is HOLD", () => {
  const f = fixture();
  f.input.registry.anchors[0].authorityId = "ATTACKER";
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "REGISTRY_SIGNATURE_INVALID" });
});

test("5 root-signed revoked anchor is HOLD", () => {
  const f = fixture();
  f.input.registry.anchors[0].status = "REVOKED";
  resignRegistry(f);
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "ANCHOR_NOT_ACTIVE" });
});

test("6 evidence version substitution is HOLD", () => {
  const f = fixture();
  f.input.attestations[0].subject.subjectVersion = "v6";
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "SUBJECT_BINDING_MISMATCH" });
});

test("7 evidence path substitution is HOLD", () => {
  const f = fixture();
  f.input.attestations[0].subject.subjectPath = "other/path.json";
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "SUBJECT_BINDING_MISMATCH" });
});

test("8 old state revision replay is HOLD", () => {
  const f = fixture();
  f.input.attestations[1].subject.stateRevision = 11;
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "SUBJECT_BINDING_MISMATCH" });
});

test("9 current authority rotation invalidates old attestation", () => {
  const f = fixture();
  f.input.current.activeRolesAndAuthority.EVIDENCE_AUTHORITY = "AUTH-EVIDENCE-ROTATED";
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "AUTHORITY_MISMATCH" });
});

test("10 root-delegated key cannot impersonate another anchor authority", () => {
  const f = fixture();
  f.input.attestations[0].proofKeyId = "PROOF-LANE";
  f.input.attestations[0].proofValue = sig(f.proofPairs["AUTH-LANE-1"].privateKey, canonicalProvenanceAttestationPayload(f.input.attestations[0]));
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "PROOF_AUTHORITY_MISMATCH" });
});

test("11 forged attestation signature is HOLD", () => {
  const f = fixture();
  f.input.attestations[0].proofValue = sig(pair().privateKey, canonicalProvenanceAttestationPayload(f.input.attestations[0]));
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "PROOF_INVALID" });
});

test("12 revoked proof key is HOLD even with previously valid signature", () => {
  const f = fixture();
  f.revocation.revokedProofKeyIds = ["PROOF-EVIDENCE"];
  f.revocation.signatureBase64 = sig(f.rootPair.privateKey, canonicalRevocationPayload(f.revocation));
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "PROOF_KEY_REVOKED" });
});

test("13 revocation rollback is HOLD", () => {
  const f = fixture();
  f.input.externalTrust.minRevocationSequence = 21;
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "EXTERNAL_TRUST_NOT_VERIFIED" });
});

test("14 stale revocation data is HOLD", () => {
  const f = fixture();
  f.input.externalTrust.revocationSnapshot.expiresAt = "2026-09-11T08:20:00+09:00";
  f.input.externalTrust.revocationSnapshot.signatureBase64 = sig(f.rootPair.privateKey, canonicalRevocationPayload(f.input.externalTrust.revocationSnapshot));
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "EXTERNAL_TRUST_NOT_VERIFIED" });
});

test("15 missing verifier identity attestation is HOLD", () => {
  const f = fixture();
  f.input.attestations = f.input.attestations.filter((a) => a.attestationId !== "ATT-IDENTITY");
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "REQUIRED_ATTESTATION_MISSING" });
});

test("16 duplicate attestation id is invalid", () => {
  const f = fixture();
  f.input.attestations[1].attestationId = f.input.attestations[0].attestationId;
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "INVALID_PROVENANCE_INPUT" });
});

test("17 current-only mode verifies refs + lane without verifier identity", () => {
  const f = fixture();
  f.input.result = null;
  f.input.attestations = f.input.attestations.filter((a) => a.subject.subjectKind !== "VERIFIER_IDENTITY");
  const d = evaluateProvenanceVerification(f.input);
  assert.equal(d.status, "VERIFIED");
  assert.deepEqual(d.verified.map((v) => v.subjectKind), ["EVIDENCE_REF", "INDEPENDENT_LANE"]);
});

test("18 future-issued attestation is HOLD", () => {
  const f = fixture();
  f.input.attestations[0].issuedAt = "2026-09-11T08:31:00+09:00";
  resignAttestation(f, 0);
  assert.deepEqual(evaluateProvenanceVerification(f.input), { status: "HOLD", reason: "ATTESTATION_NOT_YET_VALID" });
});

test("19 exact anchor version is selected when multiple versions share anchorId", () => {
  const f = fixture();
  f.input.registry.anchors.unshift({ ...f.input.registry.anchors[0], anchorVersion: "0", status: "REVOKED" });
  resignRegistry(f);
  const d = evaluateProvenanceVerification(f.input);
  assert.equal(d.status, "VERIFIED");
});
