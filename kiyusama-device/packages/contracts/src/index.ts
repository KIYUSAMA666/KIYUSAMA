export const RESULT_STATUSES = [
  'SUCCESS',
  'FAILED',
  'TIMEOUT',
  'QUOTA_EXCEEDED',
] as const;

export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const OUTPUT_FORMATS = ['text', 'json', 'markdown'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export interface ProviderExecutionRef {
  session_id?: string;
  deployment_run_id?: string;
  run_id?: string;
  [key: string]: unknown;
}

export interface UniversalResultContainer {
  schema_version: 'device-result/0.1';
  /** Root trace ID across all hops. Immutable for the lifetime of the job. */
  device_event_id: string;
  /** Unique ID for this specific return delivery. Dedupe target. */
  delivery_event_id: string;
  /** Positive integer hop sequence: 1, 2, 3, ... */
  hop: number;
  provider: string;
  provider_execution: ProviderExecutionRef;
  status: ResultStatus;
  output: {
    format: OutputFormat;
    text: string;
    structured: Record<string, unknown> | null;
  };
  metrics: {
    duration_ms: number;
    turns_count?: number;
  };
  error: {
    code: string;
    message: string;
  } | null;
  /** RFC3339 timestamp. */
  completed_at: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

const isRfc3339 = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  return rfc3339.test(value) && !Number.isNaN(Date.parse(value));
};

export function validateUniversalResultContainer(
  input: unknown,
): ValidationResult<UniversalResultContainer> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '$', message: 'must be an object' }] };
  }

  if (input.schema_version !== 'device-result/0.1') {
    issues.push({ path: 'schema_version', message: 'must equal device-result/0.1' });
  }
  if (!isNonEmptyString(input.device_event_id)) {
    issues.push({ path: 'device_event_id', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(input.delivery_event_id)) {
    issues.push({ path: 'delivery_event_id', message: 'must be a non-empty string' });
  }
  if (!isPositiveInteger(input.hop)) {
    issues.push({ path: 'hop', message: 'must be a positive integer' });
  }
  if (!isNonEmptyString(input.provider)) {
    issues.push({ path: 'provider', message: 'must be a non-empty string' });
  }
  if (!isRecord(input.provider_execution)) {
    issues.push({ path: 'provider_execution', message: 'must be an object' });
  }
  if (!RESULT_STATUSES.includes(input.status as ResultStatus)) {
    issues.push({ path: 'status', message: `must be one of: ${RESULT_STATUSES.join(', ')}` });
  }

  if (!isRecord(input.output)) {
    issues.push({ path: 'output', message: 'must be an object' });
  } else {
    if (!OUTPUT_FORMATS.includes(input.output.format as OutputFormat)) {
      issues.push({ path: 'output.format', message: `must be one of: ${OUTPUT_FORMATS.join(', ')}` });
    }
    if (typeof input.output.text !== 'string') {
      issues.push({ path: 'output.text', message: 'must be a string' });
    }
    if (!(input.output.structured === null || isRecord(input.output.structured))) {
      issues.push({ path: 'output.structured', message: 'must be an object or null' });
    }
  }

  if (!isRecord(input.metrics)) {
    issues.push({ path: 'metrics', message: 'must be an object' });
  } else {
    if (!isFiniteNonNegativeNumber(input.metrics.duration_ms)) {
      issues.push({ path: 'metrics.duration_ms', message: 'must be a finite number >= 0' });
    }
    if (
      input.metrics.turns_count !== undefined &&
      !(typeof input.metrics.turns_count === 'number' &&
        Number.isInteger(input.metrics.turns_count) &&
        input.metrics.turns_count >= 0)
    ) {
      issues.push({ path: 'metrics.turns_count', message: 'must be an integer >= 0 when present' });
    }
  }

  if (input.error !== null) {
    if (!isRecord(input.error)) {
      issues.push({ path: 'error', message: 'must be an object or null' });
    } else {
      if (!isNonEmptyString(input.error.code)) {
        issues.push({ path: 'error.code', message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(input.error.message)) {
        issues.push({ path: 'error.message', message: 'must be a non-empty string' });
      }
    }
  }

  if (!isRfc3339(input.completed_at)) {
    issues.push({ path: 'completed_at', message: 'must be a valid RFC3339 timestamp with timezone' });
  }

  if (input.status === 'SUCCESS' && input.error !== null) {
    issues.push({ path: 'error', message: 'must be null when status is SUCCESS' });
  }
  if (
    RESULT_STATUSES.includes(input.status as ResultStatus) &&
    input.status !== 'SUCCESS' &&
    input.error === null
  ) {
    issues.push({ path: 'error', message: 'must be present when status is not SUCCESS' });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: input as unknown as UniversalResultContainer };
}

export function isValidUniversalResultContainer(
  input: unknown,
): input is UniversalResultContainer {
  return validateUniversalResultContainer(input).ok;
}

// KIYUSAMA OS 2.0 / TONTON canonical stage contract.
// This is a normalization layer over existing legacy lanes; it does not require
// replacing working WATCH/WAKE/ROUTE/DELIVER/ACK/VERIFY/RECORD implementations.
export const TONTON_STAGES = [
  'WATCH',
  'WAKE',
  'ROUTE',
  'DELIVER',
  'ACK',
  'VERIFY',
  'RECORD',
] as const;

export type TontonStage = (typeof TONTON_STAGES)[number];

export const TONTON_STAGE_STATUSES = [
  'PENDING',
  'STARTED',
  'SUCCESS',
  'FAILED',
  'SKIPPED_COMPAT',
  'BLOCKED',
] as const;

export type TontonStageStatus = (typeof TONTON_STAGE_STATUSES)[number];

export interface TontonStageRecord {
  schema_version: 'tonton-stage/2.0';
  /** Immutable root trace across the full seven-stage loop. */
  flow_id: string;
  /** Unique event identifier for this stage transition. */
  event_id: string;
  stage: TontonStage;
  actor: string;
  target: string;
  previous_stage: TontonStage | null;
  status: TontonStageStatus;
  /** Durable pointer to audit/readback evidence. */
  evidence_ref: string | null;
  /** RFC3339 timestamp with timezone. */
  created_at: string;
  next_stage: TontonStage | null;
  failure_reason: string | null;
  /** Legacy object/function/event that performed this stage, when known. */
  legacy_ref?: string;
  /** Optional continuation metadata. */
  metadata?: Record<string, unknown>;
}

const stageIndex = (stage: TontonStage): number => TONTON_STAGES.indexOf(stage);

export function validateTontonStageRecord(
  input: unknown,
): ValidationResult<TontonStageRecord> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '$', message: 'must be an object' }] };
  }

  if (input.schema_version !== 'tonton-stage/2.0') {
    issues.push({ path: 'schema_version', message: 'must equal tonton-stage/2.0' });
  }
  if (!isNonEmptyString(input.flow_id)) {
    issues.push({ path: 'flow_id', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(input.event_id)) {
    issues.push({ path: 'event_id', message: 'must be a non-empty string' });
  }
  if (!TONTON_STAGES.includes(input.stage as TontonStage)) {
    issues.push({ path: 'stage', message: `must be one of: ${TONTON_STAGES.join(', ')}` });
  }
  if (!isNonEmptyString(input.actor)) {
    issues.push({ path: 'actor', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(input.target)) {
    issues.push({ path: 'target', message: 'must be a non-empty string' });
  }
  if (!(input.previous_stage === null || TONTON_STAGES.includes(input.previous_stage as TontonStage))) {
    issues.push({ path: 'previous_stage', message: 'must be a valid TONTON stage or null' });
  }
  if (!TONTON_STAGE_STATUSES.includes(input.status as TontonStageStatus)) {
    issues.push({ path: 'status', message: `must be one of: ${TONTON_STAGE_STATUSES.join(', ')}` });
  }
  if (!(input.evidence_ref === null || isNonEmptyString(input.evidence_ref))) {
    issues.push({ path: 'evidence_ref', message: 'must be a non-empty string or null' });
  }
  if (!isRfc3339(input.created_at)) {
    issues.push({ path: 'created_at', message: 'must be a valid RFC3339 timestamp with timezone' });
  }
  if (!(input.next_stage === null || TONTON_STAGES.includes(input.next_stage as TontonStage))) {
    issues.push({ path: 'next_stage', message: 'must be a valid TONTON stage or null' });
  }
  if (!(input.failure_reason === null || isNonEmptyString(input.failure_reason))) {
    issues.push({ path: 'failure_reason', message: 'must be a non-empty string or null' });
  }
  if (input.legacy_ref !== undefined && !isNonEmptyString(input.legacy_ref)) {
    issues.push({ path: 'legacy_ref', message: 'must be a non-empty string when present' });
  }
  if (input.metadata !== undefined && !isRecord(input.metadata)) {
    issues.push({ path: 'metadata', message: 'must be an object when present' });
  }

  const stage = TONTON_STAGES.includes(input.stage as TontonStage)
    ? (input.stage as TontonStage)
    : null;
  const previous = TONTON_STAGES.includes(input.previous_stage as TontonStage)
    ? (input.previous_stage as TontonStage)
    : null;
  const next = TONTON_STAGES.includes(input.next_stage as TontonStage)
    ? (input.next_stage as TontonStage)
    : null;

  if (stage === 'WATCH' && input.previous_stage !== null) {
    issues.push({ path: 'previous_stage', message: 'WATCH must begin with previous_stage=null' });
  }
  if (stage === 'RECORD' && input.next_stage !== null && input.next_stage !== 'WATCH') {
    issues.push({ path: 'next_stage', message: 'RECORD may terminate or continue only to WATCH' });
  }
  if (stage && previous && stageIndex(previous) >= stageIndex(stage)) {
    issues.push({ path: 'previous_stage', message: 'must precede the current stage' });
  }
  if (stage && next && stage !== 'RECORD' && stageIndex(next) <= stageIndex(stage)) {
    issues.push({ path: 'next_stage', message: 'must follow the current stage' });
  }

  const status = TONTON_STAGE_STATUSES.includes(input.status as TontonStageStatus)
    ? (input.status as TontonStageStatus)
    : null;

  if (status === 'FAILED' && input.failure_reason === null) {
    issues.push({ path: 'failure_reason', message: 'must be present when status is FAILED' });
  }
  if (status === 'SUCCESS' && input.failure_reason !== null) {
    issues.push({ path: 'failure_reason', message: 'must be null when status is SUCCESS' });
  }
  if ((stage === 'VERIFY' || stage === 'RECORD') && status === 'SUCCESS' && input.evidence_ref === null) {
    issues.push({ path: 'evidence_ref', message: 'is required for successful VERIFY/RECORD stages' });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: input as unknown as TontonStageRecord };
}

export function isValidTontonStageRecord(input: unknown): input is TontonStageRecord {
  return validateTontonStageRecord(input).ok;
}
