import { generateKeyPairSync, sign } from "node:crypto";
import { executeTrustedCommit } from "../dist/src/trusted-commit-orchestrator.js";
import { SupabaseAsyncAtomicCommitBackend } from "../dist/src/supabase-storage-atomic-backend.js";
import {
  canonicalDelegationPayload,
  canonicalRevocationPayload,
  publicKeyFingerprintSha256,
} from "../dist/src/external-trust-root.js";
import {
  canonicalProvenanceAttestationPayload,
  canonicalTrustAnchorRegistryPayload,
} from "../dist/src/trust-anchor-provenance.js";

const NOW = "2026-09-11T19:56:00+09:00";
const PROOF_TYPE = "ED25519-PROVENANCE-V1";
const AUDIENCE = "kiyusama-os2-production-trusted-execution-v01";
const RELAY_URL = "https://zdypjilutgxjsneultqj.supabase.co/functions/v1/os2-production-trusted-execution-v01";

const STATE_ID = "OS2-PTE-V01-STATE";
const LINEAGE_ID = "OS2-PTE-V01-LINEAGE";
const HANDOFF_ID = "OS2-PTE-V01-HANDOFF-001";
const RESULT_ID = "OS2-PTE-V01-RESULT-001";
const ACTION_ID = "OS2-PTE-V01-ACTION-001";
const REF_ID = "OS2-PTE-V01-REF-001";

const pair = () => generateKeyPairSync("ed25519");
const pem = (key) => key.export({ type: "spki", format: "pem" }).toString();
const sig = (key, payload) => sign(null, Buffer.from(payload, "utf8"), key).toString("base64");
const subject = (kind, id, version = null, path = null) => ({
  subjectKind: kind,
  subjectId: id,
  subjectVersion: version,
  subjectPath: path,
  stateId: STATE_ID,
  stateRevision: 1,
  lineageId: LINEAGE_ID,
});

async function getGitHubOidcToken() {
  const base = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!base || !requestToken) throw new Error("GITHUB_OIDC_NOT_AVAILABLE");
  const url = new URL(base);
  url.searchParams.set("audience", AUDIENCE);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${requestToken}` },
  });
  if (!response.ok) throw new Error(`GITHUB_OIDC_REQUEST_FAILED:${response.status}`);
  const body = await response.json();
  if (!body?.value) throw new Error("GITHUB_OIDC_TOKEN_MISSING");
  return body.value;
}

function buildFixture() {
  const current = {
    identity: {
      stateId: STATE_ID,
      schemaVersion: "0.1",
      stateRevision: 1,
      effectiveAt: "2026-09-11T19:50:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: LINEAGE_ID,
    },
    humanDecisionFinal: {
      decisionId: "OS2-PTE-V01-DECISION-001",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "execute isolated production trusted execution v0.1",
    },
    mainLineTask: {
      taskId: "OS2-PTE-V01-TASK-001",
      description: "prove end-to-end trusted production commit",
    },
    nextActionSingle: {
      actionId: ACTION_ID,
      description: "commit isolated trusted execution state",
    },
    activeRolesAndAuthority: {
      EVIDENCE_AUTHORITY: "OS2-PTE-V01-AUTH-EVIDENCE",
      LANE_AUTHORITY: "OS2-PTE-V01-AUTH-LANE",
      IDENTITY_AUTHORITY: "OS2-PTE-V01-AUTH-IDENTITY",
    },
    activeGuards: [],
    confirmedRefIndex: [
      {
        id: REF_ID,
        status: "VERIFIED",
        expectedVersion: "v1",
        path: "os2-pte-v01/evidence/ref-001.json",
      },
    ],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-11T19:54:00+09:00",
      evidenceSource: "KIRA-INDEPENDENT",
    },
  };

  const rootPair = pair();
  const rootPem = pem(rootPair.publicKey);
  const root = {
    rootId: "OS2-PTE-V01-ROOT",
    rootVersion: "1",
    algorithm: "ED25519",
    publicKeyPem: rootPem,
    validFrom: "2026-09-11T18:00:00+09:00",
    validUntil: null,
  };

  const proofPairs = {
    "OS2-PTE-V01-AUTH-EVIDENCE": pair(),
    "OS2-PTE-V01-AUTH-LANE": pair(),
    "OS2-PTE-V01-AUTH-IDENTITY": pair(),
  };

  const delegatedProofKeys = [
    ["OS2-PTE-V01-PROOF-EVIDENCE", "OS2-PTE-V01-AUTH-EVIDENCE"],
    ["OS2-PTE-V01-PROOF-LANE", "OS2-PTE-V01-AUTH-LANE"],
    ["OS2-PTE-V01-PROOF-IDENTITY", "OS2-PTE-V01-AUTH-IDENTITY"],
  ].map(([proofKeyId, authority]) => {
    const publicKeyPem = pem(proofPairs[authority].publicKey);
    const key = {
      proofKeyId,
      rootId: root.rootId,
      rootVersion: root.rootVersion,
      issuerAuthorityId: authority,
      proofType: PROOF_TYPE,
      algorithm: "ED25519",
      publicKeyPem,
      publicKeyFingerprintSha256: publicKeyFingerprintSha256(publicKeyPem),
      validFrom: "2026-09-11T18:00:00+09:00",
      validUntil: null,
      delegationSignatureBase64: "",
    };
    key.delegationSignatureBase64 = sig(rootPair.privateKey, canonicalDelegationPayload(key));
    return key;
  });

  const revocation = {
    snapshotId: "OS2-PTE-V01-REV-001",
    rootId: root.rootId,
    rootVersion: root.rootVersion,
    sequence: 1,
    issuedAt: "2026-09-11T19:45:00+09:00",
    expiresAt: "2026-09-11T21:00:00+09:00",
    revokedProofKeyIds: [],
    signatureBase64: "",
  };
  revocation.signatureBase64 = sig(rootPair.privateKey, canonicalRevocationPayload(revocation));

  const anchors = [
    {
      anchorId: "OS2-PTE-V01-ANCHOR-EVIDENCE",
      anchorVersion: "1",
      subjectKind: "EVIDENCE_REF",
      authorityRole: "EVIDENCE_AUTHORITY",
      authorityId: "OS2-PTE-V01-AUTH-EVIDENCE",
      status: "ACTIVE",
      validFrom: "2026-09-11T18:00:00+09:00",
      validUntil: null,
    },
    {
      anchorId: "OS2-PTE-V01-ANCHOR-LANE",
      anchorVersion: "1",
      subjectKind: "INDEPENDENT_LANE",
      authorityRole: "LANE_AUTHORITY",
      authorityId: "OS2-PTE-V01-AUTH-LANE",
      status: "ACTIVE",
      validFrom: "2026-09-11T18:00:00+09:00",
      validUntil: null,
    },
    {
      anchorId: "OS2-PTE-V01-ANCHOR-IDENTITY",
      anchorVersion: "1",
      subjectKind: "VERIFIER_IDENTITY",
      authorityRole: "IDENTITY_AUTHORITY",
      authorityId: "OS2-PTE-V01-AUTH-IDENTITY",
      status: "ACTIVE",
      validFrom: "2026-09-11T18:00:00+09:00",
      validUntil: null,
    },
  ];

  const registry = {
    registryId: "OS2-PTE-V01-REGISTRY",
    registryRevision: 1,
    anchors,
    rootSignatureBase64: "",
  };
  registry.rootSignatureBase64 = sig(
    rootPair.privateKey,
    canonicalTrustAnchorRegistryPayload(registry),
  );

  const attestations = [
    {
      attestationId: "OS2-PTE-V01-ATT-EVIDENCE",
      anchorId: "OS2-PTE-V01-ANCHOR-EVIDENCE",
      anchorVersion: "1",
      issuerAuthorityId: "OS2-PTE-V01-AUTH-EVIDENCE",
      subject: subject("EVIDENCE_REF", REF_ID, "v1", "os2-pte-v01/evidence/ref-001.json"),
      issuedAt: "2026-09-11T19:52:00+09:00",
      expiresAt: "2026-09-11T20:30:00+09:00",
      proofType: PROOF_TYPE,
      proofKeyId: "OS2-PTE-V01-PROOF-EVIDENCE",
      proofValue: "",
    },
    {
      attestationId: "OS2-PTE-V01-ATT-LANE",
      anchorId: "OS2-PTE-V01-ANCHOR-LANE",
      anchorVersion: "1",
      issuerAuthorityId: "OS2-PTE-V01-AUTH-LANE",
      subject: subject("INDEPENDENT_LANE", "KIRA-INDEPENDENT"),
      issuedAt: "2026-09-11T19:52:00+09:00",
      expiresAt: "2026-09-11T20:30:00+09:00",
      proofType: PROOF_TYPE,
      proofKeyId: "OS2-PTE-V01-PROOF-LANE",
      proofValue: "",
    },
    {
      attestationId: "OS2-PTE-V01-ATT-IDENTITY",
      anchorId: "OS2-PTE-V01-ANCHOR-IDENTITY",
      anchorVersion: "1",
      issuerAuthorityId: "OS2-PTE-V01-AUTH-IDENTITY",
      subject: subject("VERIFIER_IDENTITY", "KIRA-INDEPENDENT"),
      issuedAt: "2026-09-11T19:52:00+09:00",
      expiresAt: "2026-09-11T20:30:00+09:00",
      proofType: PROOF_TYPE,
      proofKeyId: "OS2-PTE-V01-PROOF-IDENTITY",
      proofValue: "",
    },
  ];

  for (const attestation of attestations) {
    attestation.proofValue = sig(
      proofPairs[attestation.issuerAuthorityId].privateKey,
      canonicalProvenanceAttestationPayload(attestation),
    );
  }

  const handoff = {
    handoffId: HANDOFF_ID,
    traceId: "OS2-PTE-V01-TRACE-001",
    actionId: ACTION_ID,
    sourceStateId: STATE_ID,
    sourceStateRevision: 1,
    capabilityId: "OS2-PTE-V01-CAPABILITY",
    implementationId: "OS2-PTE-V01-IMPLEMENTATION",
    issuedAt: "2026-09-11T19:53:00+09:00",
    expiresAt: "2026-09-11T20:30:00+09:00",
    evidenceRefs: [
      { id: REF_ID, expectedVersion: "v1", path: "os2-pte-v01/evidence/ref-001.json" },
    ],
    resultEvidencePolicy: {
      requiredRefs: [
        { id: REF_ID, expectedVersion: "v1", path: "os2-pte-v01/evidence/ref-001.json" },
      ],
      verifierId: "KIRA-INDEPENDENT",
      evidenceSource: "KIRA-INDEPENDENT",
    },
  };

  const result = {
    resultId: RESULT_ID,
    handoffId: HANDOFF_ID,
    traceId: "OS2-PTE-V01-TRACE-001",
    actionId: ACTION_ID,
    sourceStateId: STATE_ID,
    sourceStateRevision: 1,
    capabilityId: "OS2-PTE-V01-CAPABILITY",
    implementationId: "OS2-PTE-V01-IMPLEMENTATION",
    executorId: "OS2-PTE-V01-EXECUTOR",
    verifierId: "KIRA-INDEPENDENT",
    outcome: "SUCCEEDED",
    providerExecutionId: "OS2-PTE-V01-PROVIDER-001",
    observedAt: "2026-09-11T19:55:00+09:00",
    evidenceRefIds: [REF_ID],
    verification: "VERIFIED",
  };

  const candidate = {
    ...current,
    identity: {
      ...current.identity,
      stateRevision: 2,
      effectiveAt: "2026-09-11T19:57:00+09:00",
    },
    writeBack: {
      parent: { parentStateId: STATE_ID, parentRevision: 1 },
      source: { sourceResultId: RESULT_ID, sourceHandoffId: HANDOFF_ID },
    },
  };

  const pipeline = {
    snapshot: current,
    memoryRecord: { id: "OS2-PTE-V01-MEM-CURRENT-001", memoryClass: "CURRENT", payload: current },
    actionEvidenceRequirement: {
      actionId: ACTION_ID,
      requiredRefs: [
        { id: REF_ID, expectedVersion: "v1", path: "os2-pte-v01/evidence/ref-001.json" },
      ],
      requireIndependentLane: true,
    },
    requiredCapabilityId: "OS2-PTE-V01-CAPABILITY",
    capabilitySlot: {
      slotId: "OS2-PTE-V01-SLOT",
      capabilityId: "OS2-PTE-V01-CAPABILITY",
      status: "BOUND",
      binding: {
        capabilityId: "OS2-PTE-V01-CAPABILITY",
        implementationId: "OS2-PTE-V01-IMPLEMENTATION",
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
        minRevocationSequence: 1,
        now: NOW,
      },
      now: NOW,
    },
    writeBackRequest: {
      writeBackId: "OS2-PTE-V01-WRITEBACK-001",
      parent: { parentStateId: STATE_ID, parentRevision: 1 },
      source: { sourceResultId: RESULT_ID, sourceHandoffId: HANDOFF_ID },
      consumption: { resultConsumptionKey: RESULT_ID, handoffConsumptionKey: HANDOFF_ID },
      cas: { expectedCurrentStateId: STATE_ID, expectedCurrentRevision: 1 },
      candidate,
    },
    consumedResultIds: new Set(),
    consumedHandoffIds: new Set(),
    now: NOW,
  };

  return { pipeline, candidate };
}

const { pipeline, candidate } = buildFixture();
const relayClient = {
  async compareConsumeAndSwap(command) {
    const oidc = await getGitHubOidcToken();
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${oidc}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ command }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      throw new Error(`PRODUCTION_RELAY_FAILED:${response.status}:${JSON.stringify(body)}`);
    }
    console.log("OS2_PTE_V01_RELAY", JSON.stringify({
      status: response.status,
      github: body.github ?? null,
      result: body.result ?? null,
    }));
    return body.result;
  },
};

const backend = new SupabaseAsyncAtomicCommitBackend(relayClient);
const decision = await executeTrustedCommit({ pipeline, backend });
console.log("OS2_PTE_V01_DECISION", JSON.stringify(decision));
console.log("OS2_PTE_V01_EXPECTED_CURRENT", JSON.stringify(candidate));

if (decision.status !== "COMMITTED" || decision.commitSequence !== 1) {
  throw new Error(`PRODUCTION_TRUSTED_EXECUTION_NOT_COMMITTED:${JSON.stringify(decision)}`);
}
