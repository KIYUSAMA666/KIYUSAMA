// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  executeReentryAtomicExecutionCommit,
  type ReentryAtomicExecutionCommitBackend,
} from "../src/reentry-atomic-execution-commit.js";
import { issueReentryAuthorityLease } from "../src/reentry-authority-lease.js";
import {
  canonicalDelegationPayload,
  canonicalRevocationPayload,
  publicKeyFingerprintSha256,
} from "../src/external-trust-root.js";
import {
  canonicalProvenanceAttestationPayload,
  canonicalTrustAnchorRegistryPayload,
} from "../src/trust-anchor-provenance.js";

const NOW = "2026-09-11T08:30:00+09:00";
const PROOF_TYPE = "ED25519-PROVENANCE-V1";
const pair = () => generateKeyPairSync("ed25519");
const pem = (key) => key.export({ type: "spki", format: "pem" }).toString();
const sig = (key, payload) =>
  sign(null, Buffer.from(payload, "utf8"), key).toString("base64");
const subject = (kind, id, version = null, path = null) => ({
  subjectKind: kind,
  subjectId: id,
  subjectVersion: version,
  subjectPath: path,
  stateId: "CS-MAIN",
  stateRevision: 12,
  lineageId: "LINEAGE-MAIN-001",
});

function pipelineFixture() {
  const current = {
    identity: {
      stateId: "CS-MAIN",
      schemaVersion: "0.1",
      stateRevision: 12,
      effectiveAt: "2026-09-11T08:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-MAIN-001",
    },
    humanDecisionFinal: {
      decisionId: "HD-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "execute",
    },
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
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-11T08:20:00+09:00",
      evidenceSource: "KIRA-INDEPENDENT",
    },
  };

  const rootPair = pair();
  const rootPem = pem(rootPair.publicKey);
  const root = {
    rootId: "ROOT-1",
    rootVersion: "1",
    algorithm: "ED25519",
    publicKeyPem: rootPem,
    validFrom: "2026-09-01T00:00:00+09:00",
    validUntil: null,
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
    const k = {
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
    k.delegationSignatureBase64 = sig(
      rootPair.privateKey,
      canonicalDelegationPayload(k),
    );
    return k;
  });
  const revocation = {
    snapshotId: "REV-40",
    rootId: "ROOT-1",
    rootVersion: "1",
    sequence: 40,
    issuedAt: "2026-09-11T08:00:00+09:00",
    expiresAt: "2026-09-11T09:00:00+09:00",
    revokedProofKeyIds: [],
    signatureBase64: "",
  };
  revocation.signatureBase64 = sig(
    rootPair.privateKey,
    canonicalRevocationPayload(revocation),
  );
  const anchors = [
    {
      anchorId: "ANCHOR-EVIDENCE",
      anchorVersion: "1",
      subjectKind: "EVIDENCE_REF",
      authorityRole: "EVIDENCE_AUTHORITY",
      authorityId: "AUTH-EVIDENCE-1",
      status: "ACTIVE",
      validFrom: "2026-09-01T00:00:00+09:00",
      validUntil: null,
    },
    {
      anchorId: "ANCHOR-LANE",
      anchorVersion: "1",
      subjectKind: "INDEPENDENT_LANE",
      authorityRole: "LANE_AUTHORITY",
      authorityId: "AUTH-LANE-1",
      status: "ACTIVE",
      validFrom: "2026-09-01T00:00:00+09:00",
      validUntil: null,
    },
    {
      anchorId: "ANCHOR-IDENTITY",
      anchorVersion: "1",
      subjectKind: "VERIFIER_IDENTITY",
      authorityRole: "IDENTITY_AUTHORITY",
      authorityId: "AUTH-IDENTITY-1",
      status: "ACTIVE",
      validFrom: "2026-09-01T00:00:00+09:00",
      validUntil: null,
    },
  ];
  const registry = {
    registryId: "REGISTRY-1",
    registryRevision: 5,
    anchors,
    rootSignatureBase64: "",
  };
  registry.rootSignatureBase64 = sig(
    rootPair.privateKey,
    canonicalTrustAnchorRegistryPayload(registry),
  );
  const attestations = [
    {
      attestationId: "ATT-EVIDENCE",
      anchorId: "ANCHOR-EVIDENCE",
      anchorVersion: "1",
      issuerAuthorityId: "AUTH-EVIDENCE-1",
      subject: subject("EVIDENCE_REF", "REF-1", "v7", "evidence/ref-1.json"),
      issuedAt: "2026-09-11T08:10:00+09:00",
      expiresAt: "2026-09-11T08:50:00+09:00",
      proofType: PROOF_TYPE,
      proofKeyId: "PROOF-EVIDENCE",
      proofValue: "",
    },
    {
      attestationId: "ATT-LANE",
      anchorId: "ANCHOR-LANE",
      anchorVersion: "1",
      issuerAuthorityId: "AUTH-LANE-1",
      subject: subject("INDEPENDENT_LANE", "KIRA-INDEPENDENT"),
      issuedAt: "2026-09-11T08:10:00+09:00",
      expiresAt: "2026-09-11T08:50:00+09:00",
      proofType: PROOF_TYPE,
      proofKeyId: "PROOF-LANE",
      proofValue: "",
    },
    {
      attestationId: "ATT-IDENTITY",
      anchorId: "ANCHOR-IDENTITY",
      anchorVersion: "1",
      issuerAuthorityId: "AUTH-IDENTITY-1",
      subject: subject("VERIFIER_IDENTITY", "KIRA-INDEPENDENT"),
      issuedAt: "2026-09-11T08:10:00+09:00",
      expiresAt: "2026-09-11T08:50:00+09:00",
      proofType: PROOF_TYPE,
      proofKeyId: "PROOF-IDENTITY",
      proofValue: "",
    },
  ];
  for (const a of attestations) {
    a.proofValue = sig(
      proofPairs[a.issuerAuthorityId].privateKey,
      canonicalProvenanceAttestationPayload(a),
    );
  }

  const handoff = {
    handoffId: "HANDOFF-1",
    traceId: "TRACE-1",
    actionId: "NA-1",
    sourceStateId: "CS-MAIN",
    sourceStateRevision: 12,
    capabilityId: "CAP-1",
    implementationId: "IMPL-1",
    issuedAt: "2026-09-11T08:20:00+09:00",
    expiresAt: "2026-09-11T08:50:00+09:00",
    evidenceRefs: [{ id: "REF-1", expectedVersion: "v7", path: "evidence/ref-1.json" }],
    resultEvidencePolicy: {
      requiredRefs: [{ id: "REF-1", expectedVersion: "v7", path: "evidence/ref-1.json" }],
      verifierId: "KIRA-INDEPENDENT",
      evidenceSource: "KIRA-INDEPENDENT",
    },
  };
  const result = {
    resultId: "RESULT-1",
    handoffId: "HANDOFF-1",
    traceId: "TRACE-1",
    actionId: "NA-1",
    sourceStateId: "CS-MAIN",
    sourceStateRevision: 12,
    capabilityId: "CAP-1",
    implementationId: "IMPL-1",
    executorId: "EXECUTOR-1",
    verifierId: "KIRA-INDEPENDENT",
    outcome: "SUCCEEDED",
    providerExecutionId: "PROVIDER-1",
    observedAt: "2026-09-11T08:25:00+09:00",
    evidenceRefIds: ["REF-1"],
    verification: "VERIFIED",
  };
  const candidate = {
    ...current,
    identity: {
      ...current.identity,
      stateRevision: 13,
      effectiveAt: "2026-09-11T08:31:00+09:00",
    },
    writeBack: {
      parent: { parentStateId: "CS-MAIN", parentRevision: 12 },
      source: { sourceResultId: "RESULT-1", sourceHandoffId: "HANDOFF-1" },
    },
  };
  const pipeline = {
    snapshot: current,
    memoryRecord: { id: "MEM-CURRENT-12", memoryClass: "CURRENT", payload: current },
    actionEvidenceRequirement: {
      actionId: "NA-1",
      requiredRefs: [{ id: "REF-1", expectedVersion: "v7", path: "evidence/ref-1.json" }],
      requireIndependentLane: true,
    },
    requiredCapabilityId: "CAP-1",
    capabilitySlot: {
      slotId: "SLOT-1",
      capabilityId: "CAP-1",
      status: "BOUND",
      binding: {
        capabilityId: "CAP-1",
        implementationId: "IMPL-1",
        source: "NATIVE",
        version: "1",
        verified: true,
      },
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
        minRevocationSequence: 40,
        now: NOW,
      },
      now: NOW,
    },
    writeBackRequest: {
      writeBackId: "WB-1",
      parent: { parentStateId: "CS-MAIN", parentRevision: 12 },
      source: { sourceResultId: "RESULT-1", sourceHandoffId: "HANDOFF-1" },
      consumption: {
        resultConsumptionKey: "RESULT-1",
        handoffConsumptionKey: "HANDOFF-1",
      },
      cas: { expectedCurrentStateId: "CS-MAIN", expectedCurrentRevision: 12 },
      candidate,
    },
    consumedResultIds: new Set(),
    consumedHandoffIds: new Set(),
    now: NOW,
  };
  return pipeline;
}

function leaseFixture(leaseId = "LEASE-1") {
  const decision = issueReentryAuthorityLease({
    leaseId,
    reentryDecision: {
      status: "ALLOW",
      actionId: "NA-1",
      stateId: "CS-MAIN",
      stateRevision: 12,
      commitSequence: 0,
      attestationId: "OS2-RRG-V01-ATTEST-001",
      attestationObservedAt: "2026-09-10T23:29:59.000Z",
      attestationSource: "KIRA_INDEPENDENT_GITHUB_OIDC",
      reentryAuthorityExpiresAt: "2026-09-10T23:31:00.000Z",
    },
    issuedAt: "2026-09-10T23:30:00.000Z",
    ttlMs: 30_000,
  });
  assert.equal(decision.status, "ISSUED");
  return decision.lease;
}

function requestFor(lease) {
  return {
    leaseId: lease.leaseId,
    authorityKey: lease.authorityKey,
    actionId: lease.actionId,
    stateId: lease.stateId,
    stateRevision: lease.stateRevision,
    commitSequence: lease.commitSequence,
  };
}

class AtomicMemoryBackend implements ReentryAtomicExecutionCommitBackend {
  currentStateId = "CS-MAIN";
  currentRevision = 12;
  commitSequence = 0;
  authorityKeys = new Set<string>();
  resultIds = new Set<string>();
  handoffIds = new Set<string>();
  calls = 0;
  rejectReason: string | null = null;
  throwNext = false;

  async claimAuthorityAndCommit({ lease, request, atomicCommit }) {
    this.calls += 1;
    if (this.throwNext) throw new Error("backend failure");
    if (this.rejectReason !== null) {
      return { status: "COMMIT_REJECTED", reason: this.rejectReason };
    }
    if (
      request.authorityKey !== lease.authorityKey ||
      request.leaseId !== lease.leaseId ||
      atomicCommit.expectedCurrent.expectedCurrentStateId !== lease.stateId ||
      atomicCommit.expectedCurrent.expectedCurrentRevision !== lease.stateRevision ||
      this.currentStateId !== lease.stateId ||
      this.currentRevision !== lease.stateRevision ||
      this.commitSequence !== lease.commitSequence
    ) {
      return { status: "BINDING_MISMATCH" };
    }
    if (this.authorityKeys.has(lease.authorityKey)) {
      return { status: "ALREADY_CONSUMED" };
    }
    if (
      this.resultIds.has(atomicCommit.consumeResultId) ||
      this.handoffIds.has(atomicCommit.consumeHandoffId)
    ) {
      return { status: "COMMIT_REJECTED", reason: "CONSUMPTION_CONFLICT" };
    }

    // Simulated single transaction: mutate only after every guard passes.
    this.authorityKeys.add(lease.authorityKey);
    this.resultIds.add(atomicCommit.consumeResultId);
    this.handoffIds.add(atomicCommit.consumeHandoffId);
    this.currentRevision += 1;
    this.commitSequence += 1;
    return { status: "COMMITTED", commitSequence: this.commitSequence };
  }
}

function executionInput(backend = new AtomicMemoryBackend(), lease = leaseFixture()) {
  return {
    pipeline: pipelineFixture(),
    lease,
    request: requestFor(lease),
    now: "2026-09-10T23:30:01.000Z",
    backend,
  };
}

test("normal path atomically consumes authority/result/handoff and advances CURRENT", async () => {
  const backend = new AtomicMemoryBackend();
  const input = executionInput(backend);
  const decision = await executeReentryAtomicExecutionCommit(input);
  assert.equal(decision.status, "COMMITTED");
  assert.equal(decision.commitSequence, 1);
  assert.equal(backend.authorityKeys.size, 1);
  assert.deepEqual([...backend.resultIds], ["RESULT-1"]);
  assert.deepEqual([...backend.handoffIds], ["HANDOFF-1"]);
  assert.equal(backend.currentRevision, 13);
});

test("invalid trust pipeline never invokes or consumes authority", async () => {
  const backend = new AtomicMemoryBackend();
  const input = executionInput(backend);
  input.pipeline.provenance.attestations[0].proofValue = "FORGED";
  const decision = await executeReentryAtomicExecutionCommit(input);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.stage, "TRUST_PIPELINE");
  assert.equal(backend.calls, 0);
  assert.equal(backend.authorityKeys.size, 0);
});

test("valid lease for a different action cannot authorize the verified pipeline", async () => {
  const backend = new AtomicMemoryBackend();
  const lease = leaseFixture();
  lease.actionId = "OTHER-ACTION";
  const input = executionInput(backend, lease);
  input.request = requestFor(lease);
  const decision = await executeReentryAtomicExecutionCommit(input);
  assert.deepEqual(decision, {
    status: "HOLD",
    stage: "AUTHORITY",
    reason: "PIPELINE_LEASE_BINDING_MISMATCH",
  });
  assert.equal(backend.calls, 0);
});

test("valid lease for a different state revision cannot authorize the verified pipeline", async () => {
  const backend = new AtomicMemoryBackend();
  const lease = leaseFixture();
  lease.stateRevision = 11;
  const input = executionInput(backend, lease);
  input.request = requestFor(lease);
  const decision = await executeReentryAtomicExecutionCommit(input);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "PIPELINE_LEASE_BINDING_MISMATCH");
  assert.equal(backend.calls, 0);
});

test("tampered execution request is rejected before combined backend invocation", async () => {
  const backend = new AtomicMemoryBackend();
  const input = executionInput(backend);
  input.request.actionId = "TAMPERED";
  const decision = await executeReentryAtomicExecutionCommit(input);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.stage, "AUTHORITY");
  assert.equal(decision.reason, "LEASE_BINDING_MISMATCH");
  assert.equal(backend.calls, 0);
});

test("expired authority is rejected before combined backend invocation", async () => {
  const backend = new AtomicMemoryBackend();
  const input = executionInput(backend);
  input.now = "2026-09-10T23:31:00.000Z";
  const decision = await executeReentryAtomicExecutionCommit(input);
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.stage, "AUTHORITY");
  assert.equal(decision.reason, "REENTRY_AUTHORITY_EXPIRED");
  assert.equal(backend.calls, 0);
});

test("commit rejection leaves authority/result/handoff/CURRENT untouched", async () => {
  const backend = new AtomicMemoryBackend();
  backend.rejectReason = "REVISION_CONFLICT";
  const input = executionInput(backend);
  const decision = await executeReentryAtomicExecutionCommit(input);
  assert.deepEqual(decision, {
    status: "HOLD",
    stage: "ATOMIC_COMMIT",
    reason: "REVISION_CONFLICT",
  });
  assert.equal(backend.authorityKeys.size, 0);
  assert.equal(backend.resultIds.size, 0);
  assert.equal(backend.handoffIds.size, 0);
  assert.equal(backend.currentRevision, 12);
  assert.equal(backend.commitSequence, 0);
});

test("backend exception fails closed without partial state", async () => {
  const backend = new AtomicMemoryBackend();
  backend.throwNext = true;
  const input = executionInput(backend);
  const decision = await executeReentryAtomicExecutionCommit(input);
  assert.deepEqual(decision, {
    status: "HOLD",
    stage: "ATOMIC_COMMIT",
    reason: "BACKEND_FAILURE",
  });
  assert.equal(backend.authorityKeys.size, 0);
  assert.equal(backend.resultIds.size, 0);
  assert.equal(backend.handoffIds.size, 0);
  assert.equal(backend.currentRevision, 12);
});

test("same underlying authority cannot commit twice", async () => {
  const backend = new AtomicMemoryBackend();
  const first = executionInput(backend, leaseFixture("LEASE-A"));
  const firstDecision = await executeReentryAtomicExecutionCommit(first);
  assert.equal(firstDecision.status, "COMMITTED");

  const secondLease = leaseFixture("LEASE-B");
  const second = executionInput(backend, secondLease);
  const secondDecision = await executeReentryAtomicExecutionCommit(second);
  assert.equal(secondDecision.status, "HOLD");
  assert.equal(secondDecision.stage, "AUTHORITY");
  // CURRENT has advanced too, so the combined backend rejects exact binding before
  // any second write. In production the authority-key uniqueness is an additional guard.
  assert.equal(backend.currentRevision, 13);
  assert.equal(backend.resultIds.size, 1);
  assert.equal(backend.handoffIds.size, 1);
});

test("backend getter mutation cannot change snapshotted commit/lease/request", async () => {
  const realBackend = new AtomicMemoryBackend();
  const input = executionInput(realBackend);
  const originalAction = input.lease.actionId;
  const originalCandidateRevision = input.pipeline.writeBackRequest.candidate.identity.stateRevision;
  let getterCalls = 0;
  Object.defineProperty(input, "backend", {
    configurable: true,
    get() {
      getterCalls += 1;
      input.lease.actionId = "MUTATED-AFTER-SNAPSHOT";
      input.request.actionId = "MUTATED-AFTER-SNAPSHOT";
      input.pipeline.writeBackRequest.candidate.identity.stateRevision = 999;
      return realBackend;
    },
  });
  const decision = await executeReentryAtomicExecutionCommit(input);
  assert.equal(decision.status, "COMMITTED");
  assert.equal(getterCalls, 1);
  assert.equal(realBackend.currentRevision, 13);
  assert.equal(originalAction, "NA-1");
  assert.equal(originalCandidateRevision, 13);
});
