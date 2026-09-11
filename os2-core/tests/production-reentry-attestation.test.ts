// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  createSupabaseJsRecoveryReentryAttestationClient,
  loadProductionRecoveryReentryAttestation,
} from "../src/production-reentry-attestation.js";

const binding = {
  attestationId: "OS2-RRG-V01-ATTEST-001",
  stateId: "OS2-PTE-V01-STATE",
  lineageId: "OS2-PTE-V01-LINEAGE",
  stateRevision: 2,
  commitSequence: 1,
};

const issuer = {
  repository: "KIYUSAMA666/KIYUSAMA",
  actor: "KIYUSAMA666",
  eventName: "pull_request",
  ref: "refs/pull/85/merge",
  sha: "MERGE-SHA",
  workflowRef: "KIYUSAMA666/KIYUSAMA/.github/workflows/os2-recovery-reentry-attestation-v01.yml@refs/pull/85/merge",
  evidenceRunId: "34592393362",
  evidenceJobId: "103240868540",
};

function row() {
  return {
    ...binding,
    status: "VERIFIED",
    evidenceVerdict: "SUFFICIENT",
    observedAt: "2026-09-11T12:50:00.000Z",
    evidenceSource: "KIRA_INDEPENDENT_GITHUB_OIDC",
    issuerRepository: issuer.repository,
    issuerActor: issuer.actor,
    issuerEventName: issuer.eventName,
    issuerRef: issuer.ref,
    issuerSha: issuer.sha,
    issuerWorkflowRef: issuer.workflowRef,
    evidenceRunId: issuer.evidenceRunId,
    evidenceJobId: issuer.evidenceJobId,
  };
}

test("1 exact durable independent attestation verifies", async () => {
  const result = await loadProductionRecoveryReentryAttestation(
    { readAttestation: async () => row() },
    binding,
    issuer,
  );
  assert.equal(result.status, "VERIFIED");
});

test("2 missing attestation holds", async () => {
  const result = await loadProductionRecoveryReentryAttestation(
    { readAttestation: async () => null },
    binding,
    issuer,
  );
  assert.deepEqual(result, { status: "HOLD", reason: "MISSING_ATTESTATION" });
});

test("3 backend failure holds", async () => {
  const result = await loadProductionRecoveryReentryAttestation(
    { readAttestation: async () => { throw new Error("network"); } },
    binding,
    issuer,
  );
  assert.deepEqual(result, { status: "HOLD", reason: "BACKEND_FAILURE" });
});

test("4 malformed attestation holds", async () => {
  const result = await loadProductionRecoveryReentryAttestation(
    { readAttestation: async () => ({ nope: true }) },
    binding,
    issuer,
  );
  assert.deepEqual(result, { status: "HOLD", reason: "MALFORMED_ATTESTATION" });
});

test("5 binding substitution holds", async () => {
  const forged = row();
  forged.commitSequence = 99;
  const result = await loadProductionRecoveryReentryAttestation(
    { readAttestation: async () => forged },
    binding,
    issuer,
  );
  assert.deepEqual(result, { status: "HOLD", reason: "ATTESTATION_BINDING_MISMATCH" });
});

test("6 issuer workflow substitution holds", async () => {
  const forged = row();
  forged.issuerWorkflowRef = "FOREIGN";
  const result = await loadProductionRecoveryReentryAttestation(
    { readAttestation: async () => forged },
    binding,
    issuer,
  );
  assert.deepEqual(result, { status: "HOLD", reason: "ATTESTATION_ISSUER_MISMATCH" });
});

test("7 issuer sha substitution holds", async () => {
  const forged = row();
  forged.issuerSha = "FOREIGN";
  const result = await loadProductionRecoveryReentryAttestation(
    { readAttestation: async () => forged },
    binding,
    issuer,
  );
  assert.deepEqual(result, { status: "HOLD", reason: "ATTESTATION_ISSUER_MISMATCH" });
});

test("8 evidence source substitution is malformed", async () => {
  const forged = row();
  forged.evidenceSource = "SORA_SELF_ASSERTED";
  const result = await loadProductionRecoveryReentryAttestation(
    { readAttestation: async () => forged },
    binding,
    issuer,
  );
  assert.deepEqual(result, { status: "HOLD", reason: "MALFORMED_ATTESTATION" });
});

test("9 RPC bridge calls exact read function once", async () => {
  let calls = 0;
  const bridge = createSupabaseJsRecoveryReentryAttestationClient({
    rpc: async (name, args) => {
      calls += 1;
      assert.equal(name, "os2_reentry_read_attestation");
      assert.deepEqual(args, { p_attestation_id: binding.attestationId });
      return { data: row(), error: null };
    },
  });
  const result = await loadProductionRecoveryReentryAttestation(bridge, binding, issuer);
  assert.equal(result.status, "VERIFIED");
  assert.equal(calls, 1);
});

test("10 RPC errors are never treated as attestation data", async () => {
  const bridge = createSupabaseJsRecoveryReentryAttestationClient({
    rpc: async () => ({ data: row(), error: { message: "denied" } }),
  });
  const result = await loadProductionRecoveryReentryAttestation(bridge, binding, issuer);
  assert.deepEqual(result, { status: "HOLD", reason: "BACKEND_FAILURE" });
});
