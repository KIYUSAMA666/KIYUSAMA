import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseJsReentryAuthorityLeaseClaimBackend } from "../src/supabase-reentry-authority-lease-claim-backend.js";
import type {
  ReentryAuthorityExecutionRequest,
  ReentryAuthorityLease,
} from "../src/reentry-authority-lease.js";

const lease: ReentryAuthorityLease = {
  leaseId: "LEASE-001",
  authorityKey: '["OS2_REENTRY_AUTHORITY_V01","ACTION-001","STATE-001",7,11,"ATTEST-001","2026-09-11T13:00:00.000Z","KIRA_INDEPENDENT_GITHUB_OIDC"]',
  actionId: "ACTION-001",
  stateId: "STATE-001",
  stateRevision: 7,
  commitSequence: 11,
  attestationId: "ATTEST-001",
  attestationObservedAt: "2026-09-11T13:00:00.000Z",
  attestationSource: "KIRA_INDEPENDENT_GITHUB_OIDC",
  reentryAuthorityExpiresAt: "2026-09-11T13:01:00.000Z",
  issuedAt: "2026-09-11T13:00:01.000Z",
  expiresAt: "2026-09-11T13:00:31.000Z",
};

const request: ReentryAuthorityExecutionRequest = {
  leaseId: lease.leaseId,
  authorityKey: lease.authorityKey,
  actionId: lease.actionId,
  stateId: lease.stateId,
  stateRevision: lease.stateRevision,
  commitSequence: lease.commitSequence,
};

test("1 production bridge calls exact RPC once with lease and request", async () => {
  let calls = 0;
  const backend = createSupabaseJsReentryAuthorityLeaseClaimBackend({
    async rpc(functionName, args) {
      calls += 1;
      assert.equal(functionName, "os2_reentry_claim_authority_lease");
      assert.deepEqual(args, { p_claim: { lease, request } });
      return { data: { status: "CLAIMED" }, error: null };
    },
  });
  const result = await backend.claimExactLease({
    lease,
    request,
    claimedAt: "2026-09-11T13:00:02.000Z",
  });
  assert.deepEqual(result, { status: "CLAIMED" });
  assert.equal(calls, 1);
});

test("2 ALREADY_CONSUMED is propagated exactly", async () => {
  const backend = createSupabaseJsReentryAuthorityLeaseClaimBackend({
    async rpc() {
      return { data: { status: "ALREADY_CONSUMED" }, error: null };
    },
  });
  assert.deepEqual(
    await backend.claimExactLease({ lease, request, claimedAt: "ignored" }),
    { status: "ALREADY_CONSUMED" },
  );
});

test("3 BINDING_MISMATCH is propagated exactly", async () => {
  const backend = createSupabaseJsReentryAuthorityLeaseClaimBackend({
    async rpc() {
      return { data: { status: "BINDING_MISMATCH" }, error: null };
    },
  });
  assert.deepEqual(
    await backend.claimExactLease({ lease, request, claimedAt: "ignored" }),
    { status: "BINDING_MISMATCH" },
  );
});

test("4 provider error throws and therefore fails closed in consumer", async () => {
  const providerError = new Error("rpc down");
  const backend = createSupabaseJsReentryAuthorityLeaseClaimBackend({
    async rpc() {
      return { data: null, error: providerError };
    },
  });
  await assert.rejects(
    backend.claimExactLease({ lease, request, claimedAt: "ignored" }),
    providerError,
  );
});

test("5 malformed provider response throws", async () => {
  const backend = createSupabaseJsReentryAuthorityLeaseClaimBackend({
    async rpc() {
      return { data: null, error: null };
    },
  });
  await assert.rejects(
    backend.claimExactLease({ lease, request, claimedAt: "ignored" }),
    /malformed re-entry authority claim response/,
  );
});

test("6 unknown provider status throws", async () => {
  const backend = createSupabaseJsReentryAuthorityLeaseClaimBackend({
    async rpc() {
      return { data: { status: "CLAIMED_BUT_NOT_REALLY" }, error: null };
    },
  });
  await assert.rejects(
    backend.claimExactLease({ lease, request, claimedAt: "ignored" }),
    /unknown re-entry authority claim status/,
  );
});

test("7 caller claimedAt is not forwarded as database authority time", async () => {
  const backend = createSupabaseJsReentryAuthorityLeaseClaimBackend({
    async rpc(_functionName, args) {
      assert.equal("claimedAt" in (args.p_claim as Record<string, unknown>), false);
      return { data: { status: "CLAIMED" }, error: null };
    },
  });
  await backend.claimExactLease({
    lease,
    request,
    claimedAt: "2099-01-01T00:00:00.000Z",
  });
});
