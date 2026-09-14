import type { BusDeliveryRecord, BusMessage } from "./ai-communication-bus-core.js";
import type { LiveBusInvocationPorts, LiveBusPersistenceReceipt } from "./ai-communication-bus-live-invocation-orchestrator.js";
import type { TransportEvidence } from "./ai-communication-bus-transport-evidence.js";
import {
  isVerifiedSideEffectPermit,
  type SideEffectIntent,
  type VerifiedSideEffectPermit,
} from "./side-effect-fence.js";

export interface SupabaseBusPersistenceClientLike {
  rpc(
    functionName: string,
    args: {
      p_message: BusMessage;
      p_delivery: BusDeliveryRecord;
      p_evidence: TransportEvidence;
    },
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export interface SupabasePersistenceFence {
  permit: VerifiedSideEffectPermit;
  intent: SideEffectIntent;
  dispatchNow: string;
}

const RPC_NAME = "os2_bus_persist_delivered_with_transport";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactReceipt(raw: unknown, message: BusMessage, evidence: TransportEvidence): LiveBusPersistenceReceipt {
  if (!isRecord(raw) || (raw.status !== "STORED" && raw.status !== "IDEMPOTENT")) {
    return { ok: false };
  }

  if (
    raw.storedMessageId !== message.messageId ||
    raw.storedTraceId !== message.traceId ||
    raw.storedProviderDeliveryId !== evidence.providerDeliveryId
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    storedMessageId: raw.storedMessageId as string,
    storedTraceId: raw.storedTraceId as string,
    storedProviderDeliveryId: raw.storedProviderDeliveryId as string,
  };
}

function exactPersistenceIntent(intent: SideEffectIntent, message: BusMessage): boolean {
  return (
    intent.effectClass === "PRODUCTION_WRITE" &&
    intent.target === `supabase-bus:${message.messageId}` &&
    intent.operation === RPC_NAME &&
    intent.sourceStateId === message.current.stateId &&
    intent.sourceStateRevision === message.current.stateRevision
  );
}

export function createSupabaseBusPersistencePort(
  client: SupabaseBusPersistenceClientLike,
  fence: SupabasePersistenceFence,
): Pick<LiveBusInvocationPorts, "persistBusAndTransport"> {
  return {
    async persistBusAndTransport(input): Promise<LiveBusPersistenceReceipt> {
      if (
        !isVerifiedSideEffectPermit(fence.permit, fence.intent, fence.dispatchNow) ||
        !exactPersistenceIntent(fence.intent, input.message)
      ) {
        return { ok: false };
      }

      try {
        const { data, error } = await client.rpc(RPC_NAME, {
          p_message: input.message,
          p_delivery: input.delivery,
          p_evidence: input.evidence,
        });
        if (error !== null) return { ok: false };
        return exactReceipt(data, input.message, input.evidence);
      } catch {
        return { ok: false };
      }
    },
  };
}
