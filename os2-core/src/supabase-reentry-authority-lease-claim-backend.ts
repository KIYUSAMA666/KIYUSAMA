import type {
  ReentryAuthorityLeaseClaimBackend,
  ReentryAuthorityLease,
  ReentryAuthorityExecutionRequest,
} from "./reentry-authority-lease.js";

const CLAIM_RPC = "os2_reentry_claim_authority_lease";

export interface SupabaseJsReentryAuthorityClaimClientLike {
  rpc(
    functionName: string,
    args: { p_claim: unknown },
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

function parseClaimDecision(
  raw: unknown,
):
  | { status: "CLAIMED" }
  | { status: "ALREADY_CONSUMED" }
  | { status: "BINDING_MISMATCH" } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("malformed re-entry authority claim response");
  }
  const status = (raw as Record<string, unknown>).status;
  if (
    status !== "CLAIMED" &&
    status !== "ALREADY_CONSUMED" &&
    status !== "BINDING_MISMATCH"
  ) {
    throw new Error("unknown re-entry authority claim status");
  }
  return { status };
}

/**
 * Production claim backend for Re-entry Authority Lease v0.1.
 *
 * The database is the replay/concurrency boundary. It enforces a primary-key
 * uniqueness constraint on authority_key (and an additional unique constraint on
 * the underlying re-entry authority tuple), validates the authorityKey structure,
 * re-checks durable attestation + live CURRENT bindings, and uses database time.
 */
export function createSupabaseJsReentryAuthorityLeaseClaimBackend(
  client: SupabaseJsReentryAuthorityClaimClientLike,
): ReentryAuthorityLeaseClaimBackend {
  return {
    async claimExactLease(input: {
      lease: ReentryAuthorityLease;
      request: ReentryAuthorityExecutionRequest;
      claimedAt: string;
    }) {
      const { data, error } = await client.rpc(CLAIM_RPC, {
        p_claim: {
          lease: input.lease,
          request: input.request,
        },
      });
      if (error !== null) throw error;
      return parseClaimDecision(data);
    },
  };
}
