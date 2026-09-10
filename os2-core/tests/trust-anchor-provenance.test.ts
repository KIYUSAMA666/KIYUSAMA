// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveRequiredProvenanceSubjects,
  evaluateProvenanceVerification,
} from "../src/trust-anchor-provenance.js";

const NOW = "2026-09-11T07:30:00+09:00";

function current() {
  return {
    identity: {
      stateId: "CS-MAIN",
      schemaVersion: "0.1",
      stateRevision: 12,
      effectiveAt: "2026-09-11T07:00:00+09:00",
      scope: "KIYUSAMA_OS_2",
      lineageId: "LINEAGE-MAIN-001",
    },
    humanDecisionFinal: {
      decisionId: "HD-1",
      sourceAuthority: "KIYUSAMA",
      shortDirective: "test",
    },
    mainLineTask: { taskId: "ML-1", description: "test" },
    nextActionSingle: { actionId: "NA-1", description: "test" },
    activeRolesAndAuthority: {
      EVIDENCE_AUTHORITY: "AUTH-EVIDENCE-1",
      LANE_AUTHORITY: "AUTH-LANE-1",
      IDENTITY_AUTHORITY: "AUTH-IDENTITY-1",
    },
    activeGuards: [],
    confirmedRefIndex: [
      {
        id: "REF-1",
        status: "VERIFIED",
        expectedVersion: "v7",
        path: "evidence/ref-1.json",
      },
      {
        id: "REF-UNVERIFIED",
        status: "UNVERIFIED_REF",
        expectedVersion: null,
        path: null,
      },
    ],
    independentLaneHealth: {
      status: "VERIFIED",
      evidenceVerdict: "SUFFICIENT",
      observedAt: "2026-09-11T07:20:00+09:00",
      evidenceSource: "KIRA-INDEPENDENT",
    },
  };
}

function result() {
  return {
    resultId: "RESULT-1",
    handoffId: "HANDOFF-1",
    traceId: "TRACE-1",
    actionId: "ACTION-1",
    sourceStateId: "CS-MAIN",
    sourceStateRevision: 12,
    capabilityId: "CAP-1",
    implementationId: "IMPL-1",
    executorId: "EXECUTOR-1",
    verifierId: "KIRA-INDEPENDENT",
    outcome: "SUCCEEDED",
    providerExecutionId: "PROVIDER-1",
    observedAt: "2026-09-11T07:25:00+09:00",
    evidenceRefIds: ["REF-1"],
    verification: "VERIFIED",
  };
}

function anchors() {
  return [
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
}

function subject(kind, id, version = null, path = null) {
  return {
    subjectKind: kind,
    subjectId: id,
    subjectVersion: version,
    subjectPath: path,
    stateId: "CS-MAIN",
    stateRevision: 12,
    lineageId: "LINEAGE-MAIN-001",
  };
}

function attestations() {
  return [
    {
      attestationId: "ATT-EVIDENCE",
      anchorId: "ANCHOR-EVIDENCE",
      anchorVersion: "1",
      issuerAuthorityId: "AUTH-EVIDENCE-1",
      subject: subject("EVIDENCE_REF", "REF-1", "v7", "evidence/ref-1.json"),
      issuedAt: "2026-09-11T07:10:00+09:00",
      expiresAt: "2026-09-11T08:00:00+09:00",
      proofType: "TEST",
      proofValue: "VALID",
    },
    {
      attestationId: "ATT-LANE",
      anchorId: "ANCHOR-LANE",
      anchorVersion: "1",
      issuerAuthorityId: "AUTH-LANE-1",
      subject: subject("INDEPENDENT_LANE", "KIRA-INDEPENDENT"),
      issuedAt: "2026-09-11T07:10:00+09:00",
      expiresAt: "2026-09-11T08:00:00+09:00",
      proofType: "TEST",
      proofValue: "VALID",
    },
    {
      attestationId: "ATT-IDENTITY",
      anchorId: "ANCHOR-IDENTITY",
      anchorVersion: "1",
      issuerAuthorityId: "AUTH-IDENTITY-1",
      subject: subject("VERIFIER_IDENTITY", "KIRA-INDEPENDENT"),
      issuedAt: "2026-09-11T07:10:00+09:00",
      expiresAt: "2026-09-11T08:00:00+09:00",
      proofType: "TEST",
      proofValue: "VALID",
    },
  ];
}

function input() {
  return {
    current: current(),
    result: result(),
    registry: {
      registryId: "REGISTRY-1",
      registryRevision: 3,
      anchors: anchors(),
    },
    attestations: attestations(),
    proofVerifiers: {
      TEST: ({ attestation }) => attestation.proofValue === "VALID",
    },
    now: NOW,
  };
}

test("1 normal result provenance verifies all three subject classes", () => {
  const decision = evaluateProvenanceVerification(input());
  assert.equal(decision.status, "VERIFIED");
  assert.equal(decision.verified.length, 3);
});

test("2 requirements are derived internally from result and cannot be under-specified by caller", () => {
  assert.deepEqual(deriveRequiredProvenanceSubjects({ current: current(), result: result() }), {
    evidenceRefIds: ["REF-1"],
    requireIndependentLane: true,
    verifierId: "KIRA-INDEPENDENT",
  });
});

test("3 evidence version mismatch is HOLD", () => {
  const x = input();
  x.attestations[0].subject.subjectVersion = "v6";
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "SUBJECT_BINDING_MISMATCH",
  });
});

test("4 evidence path mismatch is HOLD", () => {
  const x = input();
  x.attestations[0].subject.subjectPath = "other/path.json";
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "SUBJECT_BINDING_MISMATCH",
  });
});

test("5 stale state revision attestation is HOLD", () => {
  const x = input();
  x.attestations[1].subject.stateRevision = 11;
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "SUBJECT_BINDING_MISMATCH",
  });
});

test("6 revoked anchor is HOLD", () => {
  const x = input();
  x.registry.anchors[0].status = "REVOKED";
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "ANCHOR_NOT_ACTIVE",
  });
});

test("7 anchor authority must still match CURRENT activeRolesAndAuthority", () => {
  const x = input();
  x.current.activeRolesAndAuthority.EVIDENCE_AUTHORITY = "AUTH-EVIDENCE-ROTATED";
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "AUTHORITY_MISMATCH",
  });
});

test("8 issuer must match anchor authority", () => {
  const x = input();
  x.attestations[0].issuerAuthorityId = "ATTACKER";
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "AUTHORITY_MISMATCH",
  });
});

test("9 expired attestation is HOLD", () => {
  const x = input();
  x.attestations[0].expiresAt = "2026-09-11T07:29:59+09:00";
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "ATTESTATION_EXPIRED",
  });
});

test("10 unsupported proof adapter is HOLD", () => {
  const x = input();
  x.attestations[0].proofType = "UNKNOWN";
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "PROOF_UNSUPPORTED",
  });
});

test("11 proof adapter rejection is HOLD", () => {
  const x = input();
  x.attestations[0].proofValue = "FORGED";
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "PROOF_INVALID",
  });
});

test("12 missing verifier identity attestation is HOLD", () => {
  const x = input();
  x.attestations = x.attestations.filter((a) => a.attestationId !== "ATT-IDENTITY");
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "REQUIRED_ATTESTATION_MISSING",
  });
});

test("13 duplicate attestation id is invalid input", () => {
  const x = input();
  x.attestations[1].attestationId = x.attestations[0].attestationId;
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "INVALID_PROVENANCE_INPUT",
  });
});

test("14 current-only mode requires provenance for VERIFIED refs and VERIFIED lane, but no verifier", () => {
  const x = input();
  x.result = null;
  x.attestations = x.attestations.filter((a) => a.subject.subjectKind !== "VERIFIER_IDENTITY");
  const decision = evaluateProvenanceVerification(x);
  assert.equal(decision.status, "VERIFIED");
  assert.deepEqual(
    decision.verified.map((v) => v.subjectKind),
    ["EVIDENCE_REF", "INDEPENDENT_LANE"],
  );
});

test("15 attestation from future is HOLD", () => {
  const x = input();
  x.attestations[0].issuedAt = "2026-09-11T07:31:00+09:00";
  assert.deepEqual(evaluateProvenanceVerification(x), {
    status: "HOLD",
    reason: "ATTESTATION_NOT_YET_VALID",
  });
});
