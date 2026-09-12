export const MEMORY_VERIFICATION_STATUSES = [
  'VERIFIED',
  'PARTIAL',
  'INFERRED',
  'UNKNOWN',
  'CONTRADICTED',
] as const;

export type MemoryVerificationStatus = (typeof MEMORY_VERIFICATION_STATUSES)[number];

export const MEMORY_SALIENCE_VALUES = ['CORE', 'HIGH', 'NORMAL', 'LOW'] as const;
export type MemorySalience = (typeof MEMORY_SALIENCE_VALUES)[number];

export const MEMORY_CONTINUATION_REQUIRED_FIELDS = [
  'memory_id',
  'subject',
  'state',
  'previous_state',
  'cause',
  'evidence_refs',
  'version',
  'freshness_at',
  'source',
  'verification_status',
  'salience',
  'next_action',
  'recorded_at',
] as const;

export const MEMORY_CONTINUATION_HARD_RULES = [
  'CORE_MEMORY_RETRIEVE_FIRST',
  'UNKNOWN_NEVER_BECOMES_VERIFIED_WITHOUT_EVIDENCE',
  'INFERRED_MUST_REMAIN_LABELED_INFERRED',
  'CONTRADICTION_MUST_PRESERVE_BOTH_OLD_AND_NEW_EVIDENCE_UNTIL_RESOLVED',
  'NEXT_ACTION_MUST_DESCRIBE_CONTINUATION_NOT_RESTART',
  'MODEL_INSTANCE_IS_REPLACEABLE_STATE_MUST_BE_EXTERNAL',
  'NO_DESTRUCTIVE_RUNTIME_ACTION_DURING_OS_2_0_COMPLETION_LOCK',
] as const;

export const MEMORY_RECOVERY_FAILURE_MODES = [
  'REDISCOVER_CRITICAL_ARTIFACT_AS_NEW',
  'RESTART_FROM_ZERO',
  'PROMOTE_RECOLLECTION_TO_FACT',
  'LOSE_REASON_FOR_PREVIOUS_DECISION',
  'FORGET_FAILED_ROUTE_AND_REPEAT_IT',
  'FORGET_SALIENCE_OF_HARD_WON_ARTIFACT',
] as const;

export interface MemoryEvidenceRef {
  ref: string;
  observed_at?: string;
  source?: string;
}

export interface MemoryContinuationRecord {
  schema_version: 'kiyusama-memory-continuation/2.0-draft1';
  memory_id: string;
  subject: string;
  state: string;
  previous_state: string | null;
  cause: string;
  evidence_refs: MemoryEvidenceRef[];
  version: number;
  freshness_at: string;
  source: string;
  verification_status: MemoryVerificationStatus;
  salience: MemorySalience;
  next_action: string;
  recorded_at: string;
}

export interface MemoryCausalDiff {
  before_state: string | null;
  after_state: string;
  cause: string;
  evidence_refs: MemoryEvidenceRef[];
  actor: string;
  timestamp: string;
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

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

const isRfc3339 = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  return pattern.test(value) && !Number.isNaN(Date.parse(value));
};

const validateEvidenceRefs = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is MemoryEvidenceRef[] => {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'must be an array' });
    return false;
  }

  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: 'must be an object' });
      return;
    }
    if (!isNonEmptyString(item.ref)) {
      issues.push({ path: `${itemPath}.ref`, message: 'must be a non-empty string' });
    }
    if (item.observed_at !== undefined && !isRfc3339(item.observed_at)) {
      issues.push({ path: `${itemPath}.observed_at`, message: 'must be RFC3339 when present' });
    }
    if (item.source !== undefined && !isNonEmptyString(item.source)) {
      issues.push({ path: `${itemPath}.source`, message: 'must be a non-empty string when present' });
    }
  });

  return true;
};

export function validateMemoryContinuationRecord(
  input: unknown,
): ValidationResult<MemoryContinuationRecord> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '$', message: 'must be an object' }] };
  }

  if (input.schema_version !== 'kiyusama-memory-continuation/2.0-draft1') {
    issues.push({ path: 'schema_version', message: 'must equal kiyusama-memory-continuation/2.0-draft1' });
  }
  if (!isNonEmptyString(input.memory_id)) issues.push({ path: 'memory_id', message: 'must be a non-empty string' });
  if (!isNonEmptyString(input.subject)) issues.push({ path: 'subject', message: 'must be a non-empty string' });
  if (!isNonEmptyString(input.state)) issues.push({ path: 'state', message: 'must be a non-empty string' });
  if (!(input.previous_state === null || isNonEmptyString(input.previous_state))) issues.push({ path: 'previous_state', message: 'must be a non-empty string or null' });
  if (!isNonEmptyString(input.cause)) issues.push({ path: 'cause', message: 'must be a non-empty string' });
  validateEvidenceRefs(input.evidence_refs, 'evidence_refs', issues);
  if (!isPositiveInteger(input.version)) issues.push({ path: 'version', message: 'must be a positive integer' });
  if (!isRfc3339(input.freshness_at)) issues.push({ path: 'freshness_at', message: 'must be a valid RFC3339 timestamp' });
  if (!isNonEmptyString(input.source)) issues.push({ path: 'source', message: 'must be a non-empty string' });
  if (!MEMORY_VERIFICATION_STATUSES.includes(input.verification_status as MemoryVerificationStatus)) {
    issues.push({ path: 'verification_status', message: `must be one of: ${MEMORY_VERIFICATION_STATUSES.join(', ')}` });
  }
  if (!MEMORY_SALIENCE_VALUES.includes(input.salience as MemorySalience)) {
    issues.push({ path: 'salience', message: `must be one of: ${MEMORY_SALIENCE_VALUES.join(', ')}` });
  }
  if (!isNonEmptyString(input.next_action)) issues.push({ path: 'next_action', message: 'must be a non-empty string' });
  if (!isRfc3339(input.recorded_at)) issues.push({ path: 'recorded_at', message: 'must be a valid RFC3339 timestamp' });

  const evidenceRefs = Array.isArray(input.evidence_refs) ? input.evidence_refs : [];
  const verificationStatus = MEMORY_VERIFICATION_STATUSES.includes(input.verification_status as MemoryVerificationStatus)
    ? (input.verification_status as MemoryVerificationStatus)
    : null;

  if (verificationStatus === 'VERIFIED' && evidenceRefs.length === 0) {
    issues.push({ path: 'evidence_refs', message: 'VERIFIED requires at least one evidence reference' });
  }
  if (verificationStatus === 'CONTRADICTED' && evidenceRefs.length < 2) {
    issues.push({ path: 'evidence_refs', message: 'CONTRADICTED requires at least two evidence references to preserve competing evidence' });
  }
  if (verificationStatus === 'INFERRED' && input.source === 'FACT') {
    issues.push({ path: 'source', message: 'INFERRED memory must not be labeled as FACT' });
  }

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: input as unknown as MemoryContinuationRecord };
}

export function validateMemoryCausalDiff(input: unknown): ValidationResult<MemoryCausalDiff> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '$', message: 'must be an object' }] };
  }

  if (!(input.before_state === null || isNonEmptyString(input.before_state))) issues.push({ path: 'before_state', message: 'must be a non-empty string or null' });
  if (!isNonEmptyString(input.after_state)) issues.push({ path: 'after_state', message: 'must be a non-empty string' });
  if (!isNonEmptyString(input.cause)) issues.push({ path: 'cause', message: 'must be a non-empty string' });
  validateEvidenceRefs(input.evidence_refs, 'evidence_refs', issues);
  if (!isNonEmptyString(input.actor)) issues.push({ path: 'actor', message: 'must be a non-empty string' });
  if (!isRfc3339(input.timestamp)) issues.push({ path: 'timestamp', message: 'must be a valid RFC3339 timestamp' });

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: input as unknown as MemoryCausalDiff };
}

export function isValidMemoryContinuationRecord(input: unknown): input is MemoryContinuationRecord {
  return validateMemoryContinuationRecord(input).ok;
}
