import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeReentryAuthorityLease,
  issueReentryAuthorityLease,
  type ReentryAuthorityExecutionRequest,
  type ReentryAuthorityLease,
  type ReentryAuthorityLeaseClaimBackend,
} from "../src/reentry-authority-lease.js";
import type { RecoveryReentryGateDecision } from "../src/recovery-reentry-gate.js";

const allowed: RecoveryReentryGateDecision = {
  status: "ALLOW",
  actionId: "ACTION-001",
  stateId: "STATE-001",
  stateRevision: 7,
  commitSequence: 11,
  attestationId: "ATTEST-001",
  attestationObservedAt: "2026-09-11T13:00:00.000Z",
  attestationSource: "KIRA_INDEPENDENT_GITHUB_OIDC",
  reentryAuthorityExpiresAt: "2026-09-11T13:01:00.000Z",
};

function issue(leaseId = "LEASE-001"): ReentryAuthorityLease {
  const decision = issueReentryAuthorityLease({
    leaseId,
    reentryDecision: allowed,
    issuedAt: "2026-09-11T13:00:01.000Z",
    ttlMs: 30_000,
  });
  assert.equal(decision.status, "ISSUED");
  return decision.lease;
}

function exactRequest(lease: ReentryAuthorityLease): ReentryAuthorityExecutionRequest {
  return {
    leaseId: lease.leaseId,
    authorityKey: lease.authorityKey,
    actionId: lease.actionId,
    stateId: lease.stateId,
    stateRevision: lease.stateRevision,
    commitSequence: lease.commitSequence,
  };
}

class AtomicMemoryBackend implements ReentryAuthorityLeaseClaimBackend {
  private consumedAuthorities = new Set<string>();
  calls = 0;

  async claimExactLease({
    lease,
    request,
  }: Parameters<ReentryAuthorityLeaseClaimBackend["claimExactLease"]>[0]) {
    this.calls += 1;
    if (
      lease.leaseId !== request.leaseId ||
      lease.authorityKey !== request.authorityKey ||
      lease.actionId !== request.actionId ||
      lease.stateId !== request.stateId ||
      lease.stateRevision !== request.stateRevision ||
      lease.commitSequence !== request.commitSequence
    ) {
      return { status: "BINDING_MISMATCH" as const };
    }
    if (this.consumedAuthorities.has(lease.authorityKey)) {
      return { status: "ALREADY_CONSUMED" as const };
    }
    this.consumedAuthorities.add(lease.authorityKey);
    return { status: "CLAIMED" as const };
  }
}

test("1 ALLOW converts to exact short-lived lease", () => {
  const decision = issueReentryAuthorityLease({
    leaseId: "LEASE-001",
    reentryDecision: allowed,
    issuedAt: "2026-09-11T13:00:01.000Z",
    ttlMs: 30_000,
  });
  assert.equal(decision.status, "ISSUED");
  assert.equal(decision.lease.leaseId, "LEASE-001");
  assert.equal(decision.lease.actionId, "ACTION-001");
  assert.equal(decision.lease.stateId, "STATE-001");
  assert.equal(decision.lease.stateRevision, 7);
  assert.equal(decision.lease.commitSequence, 11);
  assert.equal(decision.lease.attestationId, "ATTEST-001");
  assert.equal(decision.lease.attestationObservedAt, "2026-09-11T13:00:00.000Z");
  assert.equal(decision.lease.attestationSource, "KIRA_INDEPENDENT_GITHUB_OIDC");
  assert.equal(decision.lease.reentryAuthorityExpiresAt, "2026-09-11T13:01:00.000Z");
  assert.equal(decision.lease.issuedAt, "2026-09-11T13:00:01.000Z");
  assert.equal(decision.lease.expiresAt, "2026-09-11T13:00:31.000Z");
  assert.ok(decision.lease.authorityKey.includes("OS2_REENTRY_AUTHORITY_V01"));
});

test("2 HOLD re-entry cannot mint a lease", () => {
  const decision = issueReentryAuthorityLease({
    leaseId: "LEASE-001",
    reentryDecision: { status: "HOLD", reason: "RECOVERY_NOT_READY" },
    issuedAt: "2026-09-11T13:00:01.000Z",
    ttlMs: 30_000,
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "REENTRY_NOT_ALLOWED" });
});

test("3 blank lease id and invalid TTL fail closed", () => {
  assert.equal(
    issueReentryAuthorityLease({
      leaseId: " ",
      reentryDecision: allowed,
      issuedAt: "2026-09-11T13:00:01.000Z",
      ttlMs: 30_000,
    }).status,
    "HOLD",
  );
  const ttl = issueReentryAuthorityLease({
    leaseId: "LEASE-001",
    reentryDecision: allowed,
    issuedAt: "2026-09-11T13:00:01.000Z",
    ttlMs: 0,
  });
  assert.deepEqual(ttl, { status: "HOLD", reason: "LEASE_TTL_INVALID" });
});

test("4 exact lease can be atomically consumed once", async () => {
  const lease = issue();
  const backend = new AtomicMemoryBackend();
  const decision = await consumeReentryAuthorityLease({
    lease,
    request: exactRequest(lease),
    now: "2026-09-11T13:00:02.000Z",
    backend,
  });
  assert.equal(decision.status, "ALLOW_EXECUTION");
  assert.equal(backend.calls, 1);
});

test("5 replay of same lease is blocked", async () => {
  const lease = issue();
  const backend = new AtomicMemoryBackend();
  const request = exactRequest(lease);
  const first = await consumeReentryAuthorityLease({
    lease,
    request,
    now: "2026-09-11T13:00:02.000Z",
    backend,
  });
  const second = await consumeReentryAuthorityLease({
    lease,
    request,
    now: "2026-09-11T13:00:03.000Z",
    backend,
  });
  assert.equal(first.status, "ALLOW_EXECUTION");
  assert.deepEqual(second, { status: "HOLD", reason: "LEASE_ALREADY_CONSUMED" });
});

test("6 action substitution is rejected before backend", async () => {
  const lease = issue();
  const backend = new AtomicMemoryBackend();
  const request = { ...exactRequest(lease), actionId: "ACTION-EVIL" };
  const decision = await consumeReentryAuthorityLease({
    lease,
    request,
    now: "2026-09-11T13:00:02.000Z",
    backend,
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "LEASE_BINDING_MISMATCH" });
  assert.equal(backend.calls, 0);
});

test("7 state/revision/commitSequence substitutions are rejected", async () => {
  const lease = issue();
  for (const request of [
    { ...exactRequest(lease), stateId: "STATE-EVIL" },
    { ...exactRequest(lease), stateRevision: 8 },
    { ...exactRequest(lease), commitSequence: 12 },
  ]) {
    const backend = new AtomicMemoryBackend();
    const decision = await consumeReentryAuthorityLease({
      lease,
      request,
      now: "2026-09-11T13:00:02.000Z",
      backend,
    });
    assert.deepEqual(decision, { status: "HOLD", reason: "LEASE_BINDING_MISMATCH" });
    assert.equal(backend.calls, 0);
  }
});

test("8 lease cannot be used before issuance or at/after expiry", async () => {
  const lease = issue();
  const request = exactRequest(lease);
  const before = await consumeReentryAuthorityLease({
    lease,
    request,
    now: "2026-09-11T13:00:00.999Z",
    backend: new AtomicMemoryBackend(),
  });
  const expired = await consumeReentryAuthorityLease({
    lease,
    request,
    now: lease.expiresAt,
    backend: new AtomicMemoryBackend(),
  });
  assert.deepEqual(before, { status: "HOLD", reason: "LEASE_NOT_YET_VALID" });
  assert.deepEqual(expired, { status: "HOLD", reason: "LEASE_EXPIRED" });
});

test("9 malformed lease timing fails closed", async () => {
  const lease = { ...issue(), expiresAt: "not-a-time" };
  const decision = await consumeReentryAuthorityLease({
    lease,
    request: exactRequest(lease),
    now: "2026-09-11T13:00:02.000Z",
    backend: new AtomicMemoryBackend(),
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "LEASE_TIME_INVALID" });
});

test("10 backend failure never becomes execution authority", async () => {
  const lease = issue();
  const decision = await consumeReentryAuthorityLease({
    lease,
    request: exactRequest(lease),
    now: "2026-09-11T13:00:02.000Z",
    backend: {
      async claimExactLease() {
        throw new Error("backend down");
      },
    },
  });
  assert.deepEqual(decision, {
    status: "HOLD",
    reason: "LEASE_CLAIM_BACKEND_FAILURE",
  });
});

test("11 concurrent duplicate attempts produce at most one ALLOW_EXECUTION", async () => {
  const lease = issue();
  const backend = new AtomicMemoryBackend();
  const request = exactRequest(lease);
  const [a, b] = await Promise.all([
    consumeReentryAuthorityLease({
      lease,
      request,
      now: "2026-09-11T13:00:02.000Z",
      backend,
    }),
    consumeReentryAuthorityLease({
      lease,
      request,
      now: "2026-09-11T13:00:02.000Z",
      backend,
    }),
  ]);
  assert.equal([a, b].filter((x) => x.status === "ALLOW_EXECUTION").length, 1);
  assert.equal(
    [a, b].filter(
      (x) => x.status === "HOLD" && x.reason === "LEASE_ALREADY_CONSUMED",
    ).length,
    1,
  );
});

test("12 different leaseIds from the same re-entry authority still allow only one execution", async () => {
  const leaseA = issue("LEASE-A");
  const leaseB = issue("LEASE-B");
  assert.equal(leaseA.authorityKey, leaseB.authorityKey);
  const backend = new AtomicMemoryBackend();
  const [a, b] = await Promise.all([
    consumeReentryAuthorityLease({
      lease: leaseA,
      request: exactRequest(leaseA),
      now: "2026-09-11T13:00:02.000Z",
      backend,
    }),
    consumeReentryAuthorityLease({
      lease: leaseB,
      request: exactRequest(leaseB),
      now: "2026-09-11T13:00:02.000Z",
      backend,
    }),
  ]);
  assert.equal([a, b].filter((x) => x.status === "ALLOW_EXECUTION").length, 1);
  assert.equal(
    [a, b].filter(
      (x) => x.status === "HOLD" && x.reason === "LEASE_ALREADY_CONSUMED",
    ).length,
    1,
  );
});

test("13 stored ALLOW cannot mint a fresh lease after original re-entry authority expires", () => {
  const decision = issueReentryAuthorityLease({
    leaseId: "LEASE-LATE",
    reentryDecision: allowed,
    issuedAt: "2026-09-11T13:01:00.000Z",
    ttlMs: 1_000,
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "REENTRY_AUTHORITY_EXPIRED" });
});

test("14 lease cannot extend past original re-entry freshness window", () => {
  const decision = issueReentryAuthorityLease({
    leaseId: "LEASE-TOO-LONG",
    reentryDecision: allowed,
    issuedAt: "2026-09-11T13:00:50.000Z",
    ttlMs: 30_000,
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "LEASE_EXCEEDS_REENTRY_WINDOW" });
});

test("15 authorityKey tampering is rejected before backend", async () => {
  const lease = { ...issue(), authorityKey: "FORGED" };
  const backend = new AtomicMemoryBackend();
  const decision = await consumeReentryAuthorityLease({
    lease,
    request: exactRequest(lease),
    now: "2026-09-11T13:00:02.000Z",
    backend,
  });
  assert.deepEqual(decision, { status: "HOLD", reason: "LEASE_BINDING_MISMATCH" });
  assert.equal(backend.calls, 0);
});
