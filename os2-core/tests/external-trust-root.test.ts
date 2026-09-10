// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  canonicalDelegationPayload,
  canonicalRevocationPayload,
  evaluateExternalTrustRoot,
  publicKeyFingerprintSha256,
  verifyDelegatedProof,
} from "../src/external-trust-root.js";

const NOW = "2026-09-11T08:30:00+09:00";

function pair() {
  return generateKeyPairSync("ed25519");
}

function pem(key) {
  return key.export({ type: "spki", format: "pem" }).toString();
}

function sig(privateKey, payload) {
  return sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64");
}

function fixture() {
  const rootPair = pair();
  const proofPair = pair();
  const rootPem = pem(rootPair.publicKey);
  const proofPem = pem(proofPair.publicKey);

  const root = {
    rootId: "ROOT-1",
    rootVersion: "1",
    algorithm: "ED25519",
    publicKeyPem: rootPem,
    validFrom: "2026-09-01T00:00:00+09:00",
    validUntil: null,
  };

  const delegated = {
    proofKeyId: "PROOF-KEY-1",
    rootId: "ROOT-1",
    rootVersion: "1",
    issuerAuthorityId: "AUTH-EVIDENCE-1",
    proofType: "ED25519-PROVENANCE-V1",
    algorithm: "ED25519",
    publicKeyPem: proofPem,
    publicKeyFingerprintSha256: publicKeyFingerprintSha256(proofPem),
    validFrom: "2026-09-01T00:00:00+09:00",
    validUntil: null,
    delegationSignatureBase64: "",
  };
  delegated.delegationSignatureBase64 = sig(rootPair.privateKey, canonicalDelegationPayload(delegated));

  const revocation = {
    snapshotId: "REV-10",
    rootId: "ROOT-1",
    rootVersion: "1",
    sequence: 10,
    issuedAt: "2026-09-11T08:00:00+09:00",
    expiresAt: "2026-09-11T09:00:00+09:00",
    revokedProofKeyIds: [],
    signatureBase64: "",
  };
  revocation.signatureBase64 = sig(rootPair.privateKey, canonicalRevocationPayload(revocation));

  const input = {
    root,
    expectedRootFingerprintSha256: publicKeyFingerprintSha256(rootPem),
    delegatedProofKeys: [delegated],
    revocationSnapshot: revocation,
    minRevocationSequence: 10,
    now: NOW,
  };

  return { rootPair, proofPair, rootPem, proofPem, delegated, revocation, input };
}

test("1 pinned root + signed revocation + signed delegation verifies", () => {
  const f = fixture();
  const d = evaluateExternalTrustRoot(f.input);
  assert.equal(d.status, "VERIFIED");
  assert.equal(d.context.revocationSequence, 10);
});

test("2 substituted root key is rejected by pinned fingerprint", () => {
  const f = fixture();
  f.input.root.publicKeyPem = pem(pair().publicKey);
  assert.deepEqual(evaluateExternalTrustRoot(f.input), {
    status: "HOLD",
    reason: "ROOT_FINGERPRINT_MISMATCH",
  });
});

test("3 forged revocation snapshot signature is rejected", () => {
  const f = fixture();
  f.input.revocationSnapshot.revokedProofKeyIds = ["PROOF-KEY-1"];
  assert.deepEqual(evaluateExternalTrustRoot(f.input), {
    status: "HOLD",
    reason: "REVOCATION_SIGNATURE_INVALID",
  });
});

test("4 revocation rollback below persisted watermark is rejected", () => {
  const f = fixture();
  f.input.minRevocationSequence = 11;
  assert.deepEqual(evaluateExternalTrustRoot(f.input), {
    status: "HOLD",
    reason: "REVOCATION_ROLLBACK",
  });
});

test("5 stale revocation snapshot is rejected", () => {
  const f = fixture();
  f.input.now = "2026-09-11T09:00:01+09:00";
  assert.deepEqual(evaluateExternalTrustRoot(f.input), {
    status: "HOLD",
    reason: "REVOCATION_NOT_FRESH",
  });
});

test("6 delegation tampering after root signature is rejected", () => {
  const f = fixture();
  f.input.delegatedProofKeys[0].issuerAuthorityId = "ATTACKER";
  assert.deepEqual(evaluateExternalTrustRoot(f.input), {
    status: "HOLD",
    reason: "DELEGATION_SIGNATURE_INVALID",
  });
});

test("7 delegated public-key substitution is rejected by fingerprint", () => {
  const f = fixture();
  f.input.delegatedProofKeys[0].publicKeyPem = pem(pair().publicKey);
  assert.deepEqual(evaluateExternalTrustRoot(f.input), {
    status: "HOLD",
    reason: "DELEGATED_KEY_FINGERPRINT_MISMATCH",
  });
});

test("8 root-signed revocation makes delegated proof key unusable", () => {
  const f = fixture();
  f.revocation.revokedProofKeyIds = ["PROOF-KEY-1"];
  f.revocation.signatureBase64 = sig(f.rootPair.privateKey, canonicalRevocationPayload(f.revocation));
  const d = evaluateExternalTrustRoot(f.input);
  assert.equal(d.status, "VERIFIED");
  assert.deepEqual(
    verifyDelegatedProof(d.context, "PROOF-KEY-1", "AUTH-EVIDENCE-1", "ED25519-PROVENANCE-V1", "payload", sig(f.proofPair.privateKey, "payload"), NOW),
    { status: "HOLD", reason: "PROOF_KEY_REVOKED" },
  );
});

test("9 delegated key cannot impersonate another authority", () => {
  const f = fixture();
  const d = evaluateExternalTrustRoot(f.input);
  assert.equal(d.status, "VERIFIED");
  assert.deepEqual(
    verifyDelegatedProof(d.context, "PROOF-KEY-1", "AUTH-OTHER", "ED25519-PROVENANCE-V1", "payload", sig(f.proofPair.privateKey, "payload"), NOW),
    { status: "HOLD", reason: "PROOF_AUTHORITY_MISMATCH" },
  );
});

test("10 delegated key cannot cross proof-type boundary", () => {
  const f = fixture();
  const d = evaluateExternalTrustRoot(f.input);
  assert.equal(d.status, "VERIFIED");
  assert.deepEqual(
    verifyDelegatedProof(d.context, "PROOF-KEY-1", "AUTH-EVIDENCE-1", "OTHER", "payload", sig(f.proofPair.privateKey, "payload"), NOW),
    { status: "HOLD", reason: "PROOF_TYPE_MISMATCH" },
  );
});

test("11 forged proof signature is rejected", () => {
  const f = fixture();
  const d = evaluateExternalTrustRoot(f.input);
  assert.equal(d.status, "VERIFIED");
  assert.deepEqual(
    verifyDelegatedProof(d.context, "PROOF-KEY-1", "AUTH-EVIDENCE-1", "ED25519-PROVENANCE-V1", "payload", sig(pair().privateKey, "payload"), NOW),
    { status: "HOLD", reason: "PROOF_SIGNATURE_INVALID" },
  );
});
