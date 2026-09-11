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
} from "../src/trust-anchor-provenance.js";
import { evaluateEndToEndTrustPipeline } from "../src/end-to-end-trust-pipeline.js";

const NOW = "2026-09-11T08:30:00+09:00";
const PROOF_TYPE = "ED25519-PROVENANCE-V1";

function pair() { return generateKeyPairSync("ed25519"); }
function pem(key) { return key.export({ type: "spki", format: "pem" }).toString(); }
function sig(privateKey, payload) {
  return sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64");
}

function snapshot() {
  return {
    identity: {
      stateId: "CS-MAIN", schemaVersion: "0.1", stateRevision: 12,
      effectiveAt: "2026-09-11T08:00:00+09:00", scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-MAIN-001",
    },
    humanDecisionFinal: { decisionId: "HD-1", sourceAuthority: "KIYUSAMA", shortDirective: "execute" },
    mainLineTask: { taskId: "ML-1", description: "integration" },
    nextActionSingle: { actionId: "NA-1", description: "execute integration action" },
    activeRolesAndAuthority: {
      EVIDENCE_AUTHORITY: "AUTH-EVIDENCE-1",
      LANE_AUTHORITY: "AUTH-LANE-1",
      IDENTITY_AUTHORITY: "AUTH-IDENTITY-1",
    },
    activeGuards: [],
    confirmedRefIndex: [
      { id: "REF-1", status: "VERIFIED", expectedVersion: "v7", path: "evidence/ref-1.json" },
    ],
    independentLaneHealth: {
      status: "VERIFIED", evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-11T08:20:00+09:00", evidenceSource: "KIRA-INDEPENDENT",
    },
  };
}

function subject(kind, id, version = null, path = null) {
  return {
    subjectKind: kind, subjectId: id, subjectVersion: version, subjectPath: path,
    stateId: "CS-MAIN", stateRevision: 12, lineageId: "LINEAGE-MAIN-001",
  };
}

function fixture() {
  const current = snapshot();
  const rootPair = pair();
  const rootPem = pem(rootPair.publicKey);
  const root = {
    rootId: "ROOT-1", rootVersion: "1", algorithm: "ED25519",
    publicKeyPem: rootPem, validFrom: "2026-09-01T00:00:00+09:00", validUntil: null,
  };

  const proofPairs = {
    "AUTH-EVIDENCE-1": pair(),
    "AUTH-LANE-1": pair(),
    "AUTH-IDENTITY-1": pair(),
  };

  const delegatedProofKeys = [
    ["PROOF-EVIDENCE", "AUTH-EVIDENCE-1"],
    ["PROOF-LANE", "AUTH-LANE-1"],
    ["PROOF-IDENTITY", "AUTH-IDENTITY-1"],
  ].map(([proofKeyId, authority]) => {
    const publicKeyPem = pem(proofPairs[authority].publicKey);
    const key = {
      proofKeyId, rootId: "ROOT-1", rootVersion: "1",
      issuerAuthorityId: authority, proofType: PROOF_TYPE, algorithm: "ED25519",
      publicKeyPem, publicKeyFingerprintSha256: publicKeyFingerprintSha256(publicKeyPem),
      validFrom: "2026-09-01T00:00:00+09:00", validUntil: null,
      delegationSignatureBase64: "",
    };
    key.delegationSignatureBase64 = sig(rootPair.privateKey, canonicalDelegationPayload(key));
    return key;
  });

  const revocation = {
    snapshotId: "REV-30", rootId: "ROOT-1", rootVersion: "1", sequence: 30,
    issuedAt: "2026-09-11T08:00:00+09:00", expiresAt: "2026-09-11T09:00:00+09:00",
    revokedProofKeyIds: [], signatureBase64: "",
  };
  revocation.signatureBase64 = sig(rootPair.privateKey, canonicalRevocationPayload(revocation));

  const anchors = [
    { anchorId: "ANCHOR-EVIDENCE", anchorVersion: "1", subjectKind: "EVIDENCE_REF", authorityRole: "EVIDENCE_AUTHORITY", authorityId: "AUTH-EVIDENCE-1", status: "ACTIVE", validFrom: "2026-09-01T00:00:00+09:00", validUntil: null },
    { anchorId: "ANCHOR-LANE", anchorVersion: "1", subjectKind: "INDEPENDENT_LANE", authorityRole: "LANE_AUTHORITY", authorityId: "AUTH-LANE-1", status: "ACTIVE", validFrom: "2026-09-01T00:00:00+09:00", validUntil: null },
    { anchorId: "ANCHOR-IDENTITY", anchorVersion: "1", subjectKind: "VERIFIER_IDENTITY", authorityRole: "IDENTITY_AUTHORITY", authorityId: "AUTH-IDENTITY-1", status: "ACTIVE", validFrom: "2026-09-01T00:00:00+09:00", validUntil: null },
  ];
  const registry = { registryId: "REGISTRY-1", registryRevision: 4, anchors, rootSignatureBase64: "" };
  registry.rootSignatureBase64 = sig(rootPair.privateKey, canonicalTrustAnchorRegistryPayload(registry));

  const attestations = [
    { attestationId: "ATT-EVIDENCE", anchorId: "ANCHOR-EVIDENCE", anchorVersion: "1", issuerAuthorityId: "AUTH-EVIDENCE-1", subject: subject("EVIDENCE_REF", "REF-1", "v7", "evidence/ref-1.json"), issuedAt: "2026-09-11T08:10:00+09:00", expiresAt: "2026-09-11T08:50:00+09:00", proofType: PROOF_TYPE, proofKeyId: "PROOF-EVIDENCE", proofValue: "" },
    { attestationId: "ATT-LANE", anchorId: "ANCHOR-LANE", anchorVersion: "1", issuerAuthorityId: "AUTH-LANE-1", subject: subject("INDEPENDENT_LANE", "KIRA-INDEPENDENT"), issuedAt: "2026-09-11T08:10:00+09:00", expiresAt: "2026-09-11T08:50:00+09:00", proofType: PROOF_TYPE, proofKeyId: "PROOF-LANE", proofValue: "" },
    { attestationId: "ATT-IDENTITY", anchorId: "ANCHOR-IDENTITY", anchorVersion: "1", issuerAuthorityId: "AUTH-IDENTITY-1", subject: subject("VERIFIER_IDENTITY", "KIRA-INDEPENDENT"), issuedAt: "2026-09-11T08:10:00+09:00", expiresAt: "2026-09-11T08:50:00+09:00", proofType: PROOF_TYPE, proofKeyId: "PROOF-IDENTITY", proofValue: "" },
  ];
  for (const a of attestations) {
    a.proofValue = sig(proofPairs[a.issuerAuthorityId].privateKey, canonicalProvenanceAttestationPayload(a));
  }

  const handoff = {
    handoffId: "HANDOFF-1", traceId: "TRACE-1", actionId: "NA-1",
    sourceStateId: "CS-MAIN", sourceStateRevision: 12,
    capabilityId: "CAP-1", implementationId: "IMPL-1",
    issuedAt: "2026-09-11T08:20:00+09:00", expiresAt: "2026-09-11T08:50:00+09:00",
    evidenceRefs: [{ id: "REF-1", expectedVersion: "v7", path: "evidence/ref-1.json" }],
    resultEvidencePolicy: {
      requiredRefs: [{ id: "REF-1", expectedVersion: "v7", path: "evidence/ref-1.json" }],
      verifierId: "KIRA-INDEPENDENT", evidenceSource: "KIRA-INDEPENDENT",
    },
  };

  const result = {
    resultId: "RESULT-1", handoffId: "HANDOFF-1", traceId: "TRACE-1", actionId: "NA-1",
    sourceStateId: "CS-MAIN", sourceStateRevision: 12,
    capabilityId: "CAP-1", implementationId: "IMPL-1",
    executorId: "EXECUTOR-1", verifierId: "KIRA-INDEPENDENT",
    outcome: "SUCCEEDED", providerExecutionId: "PROVIDER-1",
    observedAt: "2026-09-11T08:25:00+09:00", evidenceRefIds: ["REF-1"], verification: "VERIFIED",
  };

  const candidate = {
    ...current,
    identity: { ...current.identity, stateRevision: 13, effectiveAt: "2026-09-11T08:31:00+09:00" },
    nextActionSingle: { actionId: "NA-2", description: "next" },
    writeBack: {
      parent: { parentStateId: "CS-MAIN", parentRevision: 12 },
      source: { sourceResultId: "RESULT-1", sourceHandoffId: "HANDOFF-1" },
    },
  };

  const input = {
    snapshot: current,
    memoryRecord: { id: "MEM-CURRENT-12", memoryClass: "CURRENT", payload: current },
    actionEvidenceRequirement: {
      actionId: "NA-1",
      requiredRefs: [{ id: "REF-1", expectedVersion: "v7", path: "evidence/ref-1.json" }],
      requireIndependentLane: true,
    },
    requiredCapabilityId: "CAP-1",
    capabilitySlot: {
      slotId: "SLOT-1", capabilityId: "CAP-1", status: "BOUND",
      binding: { capabilityId: "CAP-1", implementationId: "IMPL-1", source: "NATIVE", version: "1", verified: true },
    },
    handoff,
    result,
    provenance: {
      registry,
      attestations,
      externalTrust: {
        root,
        expectedRootFingerprintSha256: publicKeyFingerprintSha256(rootPem),
        delegatedProofKeys,
        revocationSnapshot: revocation,
        minRevocationSequence: 30,
        now: NOW,
      },
      now: NOW,
    },
    writeBackRequest: {
      writeBackId: "WB-1",
      parent: { parentStateId: "CS-MAIN", parentRevision: 12 },
      source: { sourceResultId: "RESULT-1", sourceHandoffId: "HANDOFF-1" },
      consumption: { resultConsumptionKey: "RESULT-1", handoffConsumptionKey: "HANDOFF-1" },
      cas: { expectedCurrentStateId: "CS-MAIN", expectedCurrentRevision: 12 },
      candidate,
    },
    consumedResultIds: new Set(),
    consumedHandoffIds: new Set(),
    now: NOW,
  };

  return { input, rootPair, proofPairs, revocation };
}

function resignRevocation(f) {
  f.revocation.signatureBase64 = sig(f.rootPair.privateKey, canonicalRevocationPayload(f.revocation));
}

test("1 full CURRENT-to-WRITE-BACK path reaches atomic commit projection", () => {
  const f = fixture();
  const d = evaluateEndToEndTrustPipeline(f.input);
  assert.equal(d.status, "READY_TO_COMMIT");
  assert.equal(d.atomicCommit.expectedCurrent.expectedCurrentRevision, 12);
  assert.equal(d.atomicCommit.nextCurrent.identity.stateRevision, 13);
  assert.equal(d.atomicCommit.consumeResultId, "RESULT-1");
});

test("2 forged VERIFIED ref provenance stops before action/gate/handoff", () => {
  const f = fixture();
  f.input.provenance.attestations[0].proofValue = sig(pair().privateKey, canonicalProvenanceAttestationPayload(f.input.provenance.attestations[0]));
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "PRE_EXECUTION_TRUST", reason: "PROOF_INVALID",
  });
});

test("3 stale external revocation data stops before execution", () => {
  const f = fixture();
  f.revocation.expiresAt = "2026-09-11T08:29:59+09:00";
  resignRevocation(f);
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "PRE_EXECUTION_TRUST", reason: "EXTERNAL_TRUST_NOT_VERIFIED",
  });
});

test("4 non-CURRENT memory stops at the first seam", () => {
  const f = fixture();
  f.input.memoryRecord.memoryClass = "HISTORY";
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "MEMORY_SELECTION", reason: "NON_CURRENT_MEMORY",
  });
});

test("5 action evidence contract substitution stops after trust but before gate", () => {
  const f = fixture();
  f.input.actionEvidenceRequirement.requiredRefs[0].path = "attacker/path.json";
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "ACTION_EVIDENCE", reason: "REQUIRED_REF_BINDING_MISMATCH",
  });
});

test("6 handoff action substitution cannot cross the gate seam", () => {
  const f = fixture();
  f.input.handoff.actionId = "NA-ATTACK";
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "PRE_EXECUTION_GATE", reason: "ACTION_NOT_CURRENT",
  });
});

test("7 result from another handoff cannot reach provenance or write-back", () => {
  const f = fixture();
  f.input.result.handoffId = "HANDOFF-ATTACK";
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "EXECUTION_RESULT", reason: "HANDOFF_MISMATCH",
  });
});

test("8 executor cannot self-verify across the result seam", () => {
  const f = fixture();
  f.input.result.executorId = "KIRA-INDEPENDENT";
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "EXECUTION_RESULT", reason: "SELF_VERIFICATION_FORBIDDEN",
  });
});

test("9 forged verifier identity proof blocks result before write-back", () => {
  const f = fixture();
  f.input.provenance.attestations[2].proofValue = sig(pair().privateKey, canonicalProvenanceAttestationPayload(f.input.provenance.attestations[2]));
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "POST_EXECUTION_TRUST", reason: "PROOF_INVALID",
  });
});

test("10 revoked verifier key blocks post-execution trust even when result says VERIFIED", () => {
  const f = fixture();
  f.revocation.revokedProofKeyIds = ["PROOF-IDENTITY"];
  resignRevocation(f);
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "POST_EXECUTION_TRUST", reason: "PROOF_KEY_REVOKED",
  });
});

test("11 write-back source substitution is stopped after cryptographic provenance passes", () => {
  const f = fixture();
  f.input.writeBackRequest.source.sourceResultId = "RESULT-ATTACK";
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "WRITE_BACK", reason: "SOURCE_BINDING_MISMATCH",
  });
});

test("12 consumed result cannot be replayed into a second CURRENT", () => {
  const f = fixture();
  f.input.consumedResultIds = new Set(["RESULT-1"]);
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "WRITE_BACK", reason: "RESULT_ALREADY_CONSUMED",
  });
});

test("13 missing verifier attestation proves WRITE BACK cannot bypass post-execution trust", () => {
  const f = fixture();
  f.input.provenance.attestations = f.input.provenance.attestations.filter((a) => a.subject.subjectKind !== "VERIFIER_IDENTITY");
  assert.deepEqual(evaluateEndToEndTrustPipeline(f.input), {
    status: "HOLD", stage: "POST_EXECUTION_TRUST", reason: "REQUIRED_ATTESTATION_MISSING",
  });
});
