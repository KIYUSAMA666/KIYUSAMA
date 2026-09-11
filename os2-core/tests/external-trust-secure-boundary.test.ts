import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceExternalTrustWatermark,
  bindExternalTrustInputToBoundary,
  loadExternalTrustBoundary,
  parseExternalTrustBoundaryDecision,
  type ExternalTrustBoundaryRpcClient,
  type ExternalTrustSecureBoundary,
} from "../src/external-trust-secure-boundary.js";
import type { ExternalTrustRoot, SignedRevocationSnapshot } from "../src/external-trust-root.js";

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

function provider(status: "LOADED" | "ADVANCED", b = boundary()): unknown {
  return { status, boundary: b };
}

test("1 load accepts exact durable boundary", async () => {
  const client: ExternalTrustBoundaryRpcClient = {
    async readTrustBoundary() { return provider("LOADED"); },
    async advanceRevocationWatermark() { throw new Error("unused"); },
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

test("4 lower watermark is rejected before RPC", async () => {
  let calls = 0;
  const client: ExternalTrustBoundaryRpcClient = {
    async readTrustBoundary() { throw new Error("unused"); },
    async advanceRevocationWatermark() { calls += 1; return provider("ADVANCED"); },
  };
  assert.deepEqual(await advanceExternalTrustWatermark(client, boundary(), 6), {
    status: "HOLD",
    reason: "REVOCATION_ROLLBACK",
  });
  assert.equal(calls, 0);
});

test("5 exact generation and target watermark are sent once", async () => {
  let received: unknown;
  let calls = 0;
  const client: ExternalTrustBoundaryRpcClient = {
    async readTrustBoundary() { throw new Error("unused"); },
    async advanceRevocationWatermark(rootId, rootVersion, generation, sequence) {
      calls += 1;
      received = { rootId, rootVersion, generation, sequence };
      return provider("ADVANCED", boundary({ minRevocationSequence: 8, generation: 5 }));
    },
  };
  const decision = await advanceExternalTrustWatermark(client, boundary(), 8);
  assert.equal(decision.status, "ADVANCED");
  assert.equal(calls, 1);
  assert.deepEqual(received, { rootId: "ROOT-1", rootVersion: "v1", generation: 4, sequence: 8 });
});

test("6 provider cannot swap pinned fingerprint during advance", async () => {
  const client: ExternalTrustBoundaryRpcClient = {
    async readTrustBoundary() { throw new Error("unused"); },
    async advanceRevocationWatermark() {
      return provider("ADVANCED", boundary({ rootFingerprintSha256: "cd".repeat(32), minRevocationSequence: 8, generation: 5 }));
    },
  };
  assert.deepEqual(await advanceExternalTrustWatermark(client, boundary(), 8), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("7 provider cannot roll generation backward", async () => {
  const client: ExternalTrustBoundaryRpcClient = {
    async readTrustBoundary() { throw new Error("unused"); },
    async advanceRevocationWatermark() {
      return provider("ADVANCED", boundary({ minRevocationSequence: 8, generation: 3 }));
    },
  };
  assert.deepEqual(await advanceExternalTrustWatermark(client, boundary(), 8), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("8 provider cannot acknowledge a different watermark", async () => {
  const client: ExternalTrustBoundaryRpcClient = {
    async readTrustBoundary() { throw new Error("unused"); },
    async advanceRevocationWatermark() {
      return provider("ADVANCED", boundary({ minRevocationSequence: 99, generation: 5 }));
    },
  };
  assert.deepEqual(await advanceExternalTrustWatermark(client, boundary(), 8), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("9 unknown provider HOLD reason fails closed", () => {
  assert.deepEqual(
    parseExternalTrustBoundaryDecision({ status: "HOLD", reason: "IGNORE_PIN" }, "ROOT-1", "v1", "LOADED"),
    { status: "HOLD", reason: "BACKEND_FAILURE" },
  );
});

test("10 provider throw becomes BACKEND_FAILURE", async () => {
  const client: ExternalTrustBoundaryRpcClient = {
    async readTrustBoundary() { throw new Error("network"); },
    async advanceRevocationWatermark() { throw new Error("network"); },
  };
  assert.deepEqual(await loadExternalTrustBoundary(client, "ROOT-1", "v1"), {
    status: "HOLD",
    reason: "BACKEND_FAILURE",
  });
});

test("11 boundary values replace caller-controlled trust settings", () => {
  const root: ExternalTrustRoot = {
    rootId: "ROOT-1",
    rootVersion: "v1",
    algorithm: "ED25519",
    publicKeyPem: "PUBLIC-KEY",
    validFrom: "2026-09-11T00:00:00Z",
    validUntil: null,
  };
  const revocationSnapshot: SignedRevocationSnapshot = {
    snapshotId: "REV-8",
    rootId: "ROOT-1",
    rootVersion: "v1",
    sequence: 8,
    issuedAt: "2026-09-11T05:00:00Z",
    expiresAt: "2026-09-12T05:00:00Z",
    revokedProofKeyIds: [],
    signatureBase64: "sig",
  };
  const bound = bindExternalTrustInputToBoundary({
    root,
    delegatedProofKeys: [],
    revocationSnapshot,
    now: "2026-09-11T05:10:00Z",
  }, boundary());
  assert.equal(bound?.expectedRootFingerprintSha256, FP);
  assert.equal(bound?.minRevocationSequence, 7);
});

test("12 boundary refuses a different root version", () => {
  const root: ExternalTrustRoot = {
    rootId: "ROOT-1",
    rootVersion: "v2",
    algorithm: "ED25519",
    publicKeyPem: "PUBLIC-KEY",
    validFrom: "2026-09-11T00:00:00Z",
    validUntil: null,
  };
  const revocationSnapshot: SignedRevocationSnapshot = {
    snapshotId: "REV-8",
    rootId: "ROOT-1",
    rootVersion: "v2",
    sequence: 8,
    issuedAt: "2026-09-11T05:00:00Z",
    expiresAt: "2026-09-12T05:00:00Z",
    revokedProofKeyIds: [],
    signatureBase64: "sig",
  };
  assert.equal(bindExternalTrustInputToBoundary({
    root,
    delegatedProofKeys: [],
    revocationSnapshot,
    now: "2026-09-11T05:10:00Z",
  }, boundary()), null);
});
