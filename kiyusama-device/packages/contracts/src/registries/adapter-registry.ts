import type { AdapterId } from '../shared/ids.js';

export interface AdapterRegistryEntry {
  readonly adapter_id: AdapterId;
  readonly version: string;
  readonly integrity_hash: string;
  readonly authenticated_channel_required: boolean;
  readonly enabled: boolean;
}

export interface AdapterRegistry {
  get(adapter_id: AdapterId): Readonly<AdapterRegistryEntry> | undefined;
}
