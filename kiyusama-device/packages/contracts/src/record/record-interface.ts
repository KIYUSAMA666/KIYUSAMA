import type { EvidencePackage } from './evidence-contract.js';

export interface EvidenceRecordAdapter {
  readonly adapter_id: string;
  store(evidence: EvidencePackage): Promise<{ readonly storage_ref: string }>;
  readBack(storage_ref: string): Promise<EvidencePackage>;
  verifyStored(original: EvidencePackage, returned: EvidencePackage): Promise<boolean>;
}
