import {
  resolveCommonMemoryCurrent,
  type CommonMemoryCurrentResolutionDecision,
} from "./common-memory-current-resolution.js";
import type { MemoryRecord } from "./memory-selection.js";

export const SORA_CENTRAL_NERVE_CANARY_PAIRS = [
  "1-7",
  "2-8",
  "4-9",
  "5-10",
  "6-11",
] as const;

export type SoraCentralNerveCanaryPair =
  (typeof SORA_CENTRAL_NERVE_CANARY_PAIRS)[number];

export interface ProductionCommonMemoryCanonicalReader {
  readCanonicalRecords(
    pair: SoraCentralNerveCanaryPair,
  ): Promise<ReadonlyArray<MemoryRecord<unknown>>>;
}

/**
 * Durable SORA CURRENT retrieval for the central-nerve pair canaries.
 *
 * The injected reader is deliberately canonical-record-only. Conversation and
 * history payloads have no input path here and cannot become executable state;
 * the existing COMMON MEMORY resolver remains the sole selection authority.
 */
export async function retrieveSoraCentralNerveCurrent(
  reader: ProductionCommonMemoryCanonicalReader,
  pair: SoraCentralNerveCanaryPair,
): Promise<CommonMemoryCurrentResolutionDecision | { status: "HOLD"; reason: "BACKEND_FAILURE" }> {
  try {
    return resolveCommonMemoryCurrent(await reader.readCanonicalRecords(pair));
  } catch {
    return { status: "HOLD", reason: "BACKEND_FAILURE" };
  }
}
