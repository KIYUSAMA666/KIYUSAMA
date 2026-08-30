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
