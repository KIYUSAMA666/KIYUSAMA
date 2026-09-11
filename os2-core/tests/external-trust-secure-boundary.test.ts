import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceExternalTrustWatermarkAuthenticated,
  bindExternalTrustInputToBoundary,
  loadExternalTrustBoundary,
  parseExternalTrustBoundaryDecision,
  type ExternalTrustBoundaryRpcClient,
  type ExternalTrustSecureBoundary,
} from "../src/external-trust-secure-boundary.js";
import {
  canonicalRevocationPayload,
  type ExternalTrustRoot,
  type SignedRevocationSnapshot,
} from "../src/external-trust-root.js";

const FP = "ab".repeat(32);

function boundary(overrides: Partial<ExternalTrustSecureBoundary> = {}): ExternalTrustSecureBoundary {
  return {
    rootId: "ROOT-1",
    rootVersion: "v1",
    rootFingerprintSha256: FP,
    minRevocationSequence: 7,
    generation: 4,
    provisioningEvidenceId: "PROVISION-EVIDENCE-1",
    provisionedAt: "2026-09-11T14:00:00+09:00",
    updatedAt: "2026-09-11T14:05:00+09:00",
    ...overrides,
  };
}

function snapshot(overrides: Partial<SignedRevocationSnapshot> = {}): SignedRevocationSnapshot {
  return {
    snapshotId: "REV-8",
    rootId: "ROOT-1",
    rootVersion: "v1",
    sequence: 8,
    issuedAt: "2026-09-11T05:00:00Z",
    expiresAt: "2026-09-12T05:00:00Z",
    revokedProofKeyIds: [],
    signatureBase64: "root-signature",
    ...overrides,
  };
}

function provider(status: "LOADED" | "ADVANCED", b = boundary()): unknown {
  return { status, boundary: b };
}

function unusedRead(): Promise<unknown> {
  throw new Error("unused");
}

test("1 load accepts exact durable boundary", async () => {
  const client: ExternalTrustBoundaryRpcClient = {
    async readTrustBoundary() { return provider("LOADED"); },
    async advanceRevocationWatermarkAuthenticated() { throw new Error("unused"); },
  };
  assert.deepEqual(await loadExternalTrustBoundary(client, "ROOT-1", "v1"), {
    status: "LOADED",
    boundary: boundary(),
  });
});

test("2 forged root identity in provider response fails closed", () => {
  assert.deepEqual(
    parseExternalTrustBoundaryDecision(provider("LOADED", boundary({ rootId: "ATTACKER" })), "ROOT-1", "v1", "LOADED"),
    { status: "HOLD", reason: "BACKEND_FAILURE" },
  );
});

test("3 malformed fingerprint fails closed", () => {
  assert.deepEqual(
    parseExternalTrustBoundaryDecision(provider("LOADED", boundary({ rootFingerprintSha256: "not-a-sha256" })), "ROOT-1", "v1", "LOADED"),
    { status: "HOLD", reason: "BACKEND_FAILURE" },
  );
});

test("4 lower signed snapshot sequence is rejected before RPC", async () => {
  let calls = 0;
  const client: ExternalTrustBoundaryRpcClient = {
    readTrustBoundary: unusedRead,
    async advanceRevocationWatermarkAuthenticated() { calls += 1; return provider("ADVANCED"); },
  };
  assert.deepEqual(await advanceExternalTrustWatermarkAuthenticated(client, boundary(), snapshot({ sequence: 6 })), {
    status: "HOLD",
    reason: "REVOCATION_ROLLBACK",
  });
  assert.equal(calls, 0);
});

test("5 exact canonical signed payload and generation are sent once", async () => {
  let received: unknown;
  let calls = 0;
  const signed = snapshot();
  const client: ExternalTrustBoundaryRpcClient = {
    readTrustBoundary: unusedRead,
    async advanceRevocationWatermarkAuthenticated(rootId, rootVersion, generation, signedPayload, signatureBase64) {
      calls += 1;
      received = { rootId, rootVersion, generation, signedPayload, signatureBase64 };
      return provider("ADVANCED", boundary({ minRevocationSequence: 8, generation: 5 }));
    },
  };
  const decision = await advanceExternalTrustWatermarkAuthenticated(client, boundary(), signed);
  assert.equal(decision.status, "ADVANCED");
  assert.equal(calls, 1);
  assert.deepEqual(received, {
    rootId: "ROOT-1",
    rootVersion: "v1",
    generation: 4,
    signedPayload: canonicalRevocationPayload(signed),
    signatureBase64: "root-signature",
  });
});

test("6 provider cannot swap pinned fingerprint during authenticated advance", async () => {
  const client: ExternalTrustBoundaryRpcClient = {
    readTrustBoundary: unusedRead,
    async advanceRevocationWatermarkAuthenticated() {
      return provider("ADVANCED", boundary({ rootFingerprintSha256: "cd".repeat(32), minRevocationSequence: 8, generation: 5 }));
    },
  };
  assert.deepEqual(await advanceExternalTrustWatermarkAuthenticated(client, boundary(), snapshot()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("7 provider cannot roll generation backward", async () => {
  const client: ExternalTrustBoundaryRpcClient = {
    readTrustBoundary: unusedRead,
    async advanceRevocationWatermarkAuthenticated() {
      return provider("ADVANCED", boundary({ minRevocationSequence: 8, generation: 3 }));
    },
  };
  assert.deepEqual(await advanceExternalTrustWatermarkAuthenticated(client, boundary(), snapshot()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("8 provider cannot acknowledge a different watermark than signed snapshot", async () => {
  const client: ExternalTrustBoundaryRpcClient = {
    readTrustBoundary: unusedRead,
    async advanceRevocationWatermarkAuthenticated() {
      return provider("ADVANCED", boundary({ minRevocationSequence: 999999, generation: 5 }));
    },
  };
  assert.deepEqual(await advanceExternalTrustWatermarkAuthenticated(client, boundary(), snapshot()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("9 different signed snapshot root is rejected before RPC", async () => {
  let calls = 0;
  const client: ExternalTrustBoundaryRpcClient = {
    readTrustBoundary: unusedRead,
    async advanceRevocationWatermarkAuthenticated() { calls += 1; return provider("ADVANCED"); },
  };
  assert.deepEqual(await advanceExternalTrustWatermarkAuthenticated(client, boundary(), snapshot({ rootId: "ROOT-OTHER" })), {
    status: "HOLD",
    reason: "REVOCATION_ROOT_MISMATCH",
  });
  assert.equal(calls, 0);
});

test("10 missing signature is rejected before RPC", async () => {
  let calls = 0;
  const client: ExternalTrustBoundaryRpcClient = {
    readTrustBoundary: unusedRead,
    async advanceRevocationWatermarkAuthenticated() { calls += 1; return provider("ADVANCED"); },
  };
  assert.deepEqual(await advanceExternalTrustWatermarkAuthenticated(client, boundary(), snapshot({ signatureBase64: "" })), {
    status: "HOLD",
    reason: "REVOCATION_EVIDENCE_INVALID",
  });
  assert.equal(calls, 0);
});

test("11 authenticated DB HOLD reasons are propagated", () => {
  for (const reason of [
    "ROOT_PUBLIC_KEY_REQUIRED",
    "ROOT_FINGERPRINT_MISMATCH",
    "REVOCATION_ROOT_MISMATCH",
    "REVOCATION_NOT_FRESH",
    "REVOCATION_EVIDENCE_INVALID",
    "REVOCATION_SIGNATURE_INVALID",
    "AUTHENTICATED_REVOCATION_REQUIRED",
  ] as const) {
    assert.deepEqual(
      parseExternalTrustBoundaryDecision({ status: "HOLD", reason }, "ROOT-1", "v1", "ADVANCED", boundary()),
      { status: "HOLD", reason },
    );
  }
});

test("12 unknown provider HOLD reason fails closed", () => {
  assert.deepEqual(
    parseExternalTrustBoundaryDecision({ status: "HOLD", reason: "IGNORE_SIGNATURE" }, "ROOT-1", "v1", "ADVANCED"),
    { status: "HOLD", reason: "BACKEND_FAILURE" },
  );
});

test("13 provider throw becomes BACKEND_FAILURE", async () => {
  const client: ExternalTrustBoundaryRpcClient = {
    async readTrustBoundary() { throw new Error("network"); },
    async advanceRevocationWatermarkAuthenticated() { throw new Error("network"); },
  };
  assert.deepEqual(await loadExternalTrustBoundary(client, "ROOT-1", "v1"), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
  assert.deepEqual(await advanceExternalTrustWatermarkAuthenticated(client, boundary(), snapshot()), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("14 boundary values replace caller-controlled trust settings", () => {
  const root: ExternalTrustRoot = {
    rootId: "ROOT-1",
    rootVersion: "v1",
    algorithm: "ED25519",
    publicKeyPem: "PUBLIC-KEY",
    validFrom: "2026-09-11T00:00:00Z",
    validUntil: null,
  };
  const bound = bindExternalTrustInputToBoundary({
    root,
    delegatedProofKeys: [],
    revocationSnapshot: snapshot(),
    now: "2026-09-11T05:10:00Z",
  }, boundary());
  assert.equal(bound?.expectedRootFingerprintSha256, FP);
  assert.equal(bound?.minRevocationSequence, 7);
});

test("15 boundary refuses a different root version", () => {
  const root: ExternalTrustRoot = {
    rootId: "ROOT-1",
    rootVersion: "v2",
    algorithm: "ED25519",
    publicKeyPem: "PUBLIC-KEY",
    validFrom: "2026-09-11T00:00:00Z",
    validUntil: null,
  };
  assert.equal(bindExternalTrustInputToBoundary({
    root,
    delegatedProofKeys: [],
    revocationSnapshot: snapshot({ rootVersion: "v2" }),
    now: "2026-09-11T05:10:00Z",
  }, boundary()), null);
});

test("16 duplicate revoked proof-key ids are rejected before RPC", async () => {
  let calls = 0;
  const client: ExternalTrustBoundaryRpcClient = {
    readTrustBoundary: unusedRead,
    async advanceRevocationWatermarkAuthenticated() { calls += 1; return provider("ADVANCED"); },
  };
  assert.deepEqual(await advanceExternalTrustWatermarkAuthenticated(
    client,
    boundary(),
    snapshot({ revokedProofKeyIds: ["KEY-X", "KEY-X"] }),
  ), { status: "HOLD", reason: "REVOCATION_EVIDENCE_INVALID" });
  assert.equal(calls, 0);
});

test("17 blank revoked proof-key id is rejected before RPC", async () => {
  let calls = 0;
  const client: ExternalTrustBoundaryRpcClient = {
    readTrustBoundary: unusedRead,
    async advanceRevocationWatermarkAuthenticated() { calls += 1; return provider("ADVANCED"); },
  };
  assert.deepEqual(await advanceExternalTrustWatermarkAuthenticated(
    client,
    boundary(),
    snapshot({ revokedProofKeyIds: ["KEY-X", "   "] }),
  ), { status: "HOLD", reason: "REVOCATION_EVIDENCE_INVALID" });
  assert.equal(calls, 0);
});

test("18 runtime non-string revoked proof-key id fails closed before RPC", async () => {
  let calls = 0;
  const client: ExternalTrustBoundaryRpcClient = {
    readTrustBoundary: unusedRead,
    async advanceRevocationWatermarkAuthenticated() { calls += 1; return provider("ADVANCED"); },
  };
  const malformed = snapshot();
  (malformed as unknown as { revokedProofKeyIds: unknown[] }).revokedProofKeyIds = ["KEY-X", 42];
  assert.deepEqual(await advanceExternalTrustWatermarkAuthenticated(
    client,
    boundary(),
    malformed,
  ), { status: "HOLD", reason: "REVOCATION_EVIDENCE_INVALID" });
  assert.equal(calls, 0);
});
