export const CORE_PLANES = ['MEMORY','SIGNAL','EXECUTION','WORKER','COUNTER','SENSORY'] as const;
export type CorePlane = (typeof CORE_PLANES)[number];
export const CORE_ACTIONS = ['READ','WRITE','DISPATCH','EXECUTE','VERIFY','REPLY','RECORD'] as const;
export type CoreAction = (typeof CORE_ACTIONS)[number];
export const SIDE_EFFECT_STATES = ['NONE','REQUESTED','CONFIRMED','UNKNOWN'] as const;
export type SideEffectState = (typeof SIDE_EFFECT_STATES)[number];

export interface CoreInterfaceEnvelope {
  schema_version: 'kiyusama-core-interface/2.0-draft1';
  event_id: string;
  correlation_id: string;
  source_plane: CorePlane;
  target_plane: CorePlane;
  action: CoreAction;
  actor: string;
  authority_ref: string | null;
  evidence_refs: string[];
  side_effect_state: SideEffectState;
  payload_ref: string;
  created_at: string;
}

export interface CoreValidationResult { ok: boolean; issues: string[] }
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const rfc3339 = (v: unknown): v is string => nonempty(v) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v));

export function validateCoreInterfaceEnvelope(input: unknown): CoreValidationResult {
  const issues: string[] = [];
  if (!record(input)) return { ok:false, issues:['$ must be an object'] };
  if (input.schema_version !== 'kiyusama-core-interface/2.0-draft1') issues.push('schema_version invalid');
  for (const key of ['event_id','correlation_id','actor','payload_ref'] as const) if (!nonempty(input[key])) issues.push(`${key} required`);
  if (!CORE_PLANES.includes(input.source_plane as CorePlane)) issues.push('source_plane invalid');
  if (!CORE_PLANES.includes(input.target_plane as CorePlane)) issues.push('target_plane invalid');
  if (!CORE_ACTIONS.includes(input.action as CoreAction)) issues.push('action invalid');
  if (!(input.authority_ref === null || nonempty(input.authority_ref))) issues.push('authority_ref invalid');
  if (!Array.isArray(input.evidence_refs) || input.evidence_refs.some((x) => !nonempty(x))) issues.push('evidence_refs invalid');
  if (!SIDE_EFFECT_STATES.includes(input.side_effect_state as SideEffectState)) issues.push('side_effect_state invalid');
  if (!rfc3339(input.created_at)) issues.push('created_at invalid');
  if ((input.action === 'DISPATCH' || input.action === 'EXECUTE' || input.action === 'WRITE') && input.authority_ref === null) issues.push('authority_ref required for stateful action');
  if (input.side_effect_state === 'CONFIRMED' && (!Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0)) issues.push('confirmed side effect requires evidence');
  return { ok: issues.length === 0, issues };
}
