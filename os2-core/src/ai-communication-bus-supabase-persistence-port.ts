import type { BusDeliveryRecord, BusMessage } from "./ai-communication-bus-core.js";
import type { LiveBusInvocationPorts, LiveBusPersistenceReceipt } from "./ai-communication-bus-live-invocation-orchestrator.js";
import type { TransportEvidence } from "./ai-communication-bus-transport-evidence.js";

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

export function createSupabaseBusPersistencePort(
  client: SupabaseBusPersistenceClientLike,
): Pick<LiveBusInvocationPorts, "persistBusAndTransport"> {
  return {
    async persistBusAndTransport(input): Promise<LiveBusPersistenceReceipt> {
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
