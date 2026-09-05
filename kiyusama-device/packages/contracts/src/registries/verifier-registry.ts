import type { AdapterId, VerifierId } from '../shared/ids.js';

export interface VerifierRegistryEntry {
  readonly verifier_id: VerifierId;
  readonly subject_id: string;
  readonly version: string;
  readonly integrity_hash: string;
  readonly disallowed_adapter_ids: readonly AdapterId[];
  readonly enabled: boolean;
}

export const isIndependentVerifier = (
  verifier: VerifierRegistryEntry,
  adapter_id: AdapterId,
): boolean =>
  verifier.enabled &&
  verifier.subject_id !== adapter_id &&
  !verifier.disallowed_adapter_ids.includes(adapter_id);
