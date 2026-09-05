import type { EventId } from '../shared/ids.js';
import type { Rfc3339Timestamp } from '../shared/timestamps.js';

export const WATCH_SCHEMA_VERSION = 'tonton-watch/0.2' as const;
export type WatchTagValue = string | number | boolean | null;

export interface WatchEvent {
  readonly event_id: EventId;
  readonly event_type: string;
  readonly source: string;
  readonly occurred_at: Rfc3339Timestamp;
  readonly dedupe_key: string;
  readonly payload_ref: string;
  readonly tags: Readonly<Record<string, WatchTagValue>>;
  readonly schema_version: typeof WATCH_SCHEMA_VERSION;
}

export type WatchValidationCode = 'OK' | 'UNKNOWN_SCHEMA_VERSION';

export const validateWatchSchemaVersion = (value: unknown): WatchValidationCode =>
  typeof value === 'object' && value !== null &&
  'schema_version' in value &&
  (value as { schema_version?: unknown }).schema_version === WATCH_SCHEMA_VERSION
    ? 'OK'
    : 'UNKNOWN_SCHEMA_VERSION';
