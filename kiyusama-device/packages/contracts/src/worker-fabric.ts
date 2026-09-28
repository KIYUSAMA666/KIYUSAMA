export const WORKER_LANES = ['S','K','CHECK','MONITOR','ATTACK','DIG','IMPLEMENT','DOUBLE_ATTACK'] as const;
export type WorkerLane = (typeof WORKER_LANES)[number];
export const WORKER_STATES = ['AVAILABLE','CLAIMED','RUNNING','SUCCEEDED','FAILED','AMBIGUOUS','RELEASED'] as const;
export type WorkerState = (typeof WORKER_STATES)[number];

export interface WorkerClaim {
  schema_version: 'kiyusama-worker-claim/2.0-draft1';
  claim_id: string;
  task_id: string;
  worker_id: string;
  lane: WorkerLane;
  generation: number;
  authority_ref: string;
  input_ref: string;
  evidence_refs: string[];
  state: WorkerState;
  claimed_at: string;
  released_at: string | null;
}

export interface WorkerResult {
  schema_version: 'kiyusama-worker-result/2.0-draft1';
  claim_id: string;
  task_id: string;
  worker_id: string;
  generation: number;
  state: 'SUCCEEDED' | 'FAILED' | 'AMBIGUOUS';
  output_ref: string | null;
  evidence_refs: string[];
  error: string | null;
  completed_at: string;
}

export interface WorkerValidationResult { ok:boolean; issues:string[] }
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const stamp=(v:unknown):v is string=>nonempty(v)&&!Number.isNaN(Date.parse(v));
const generation=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=1;

export function validateWorkerClaim(input:unknown):WorkerValidationResult{
  const issues:string[]=[];
  if(!obj(input)) return {ok:false,issues:['$ must be object']};
  if(input.schema_version!=='kiyusama-worker-claim/2.0-draft1') issues.push('schema_version invalid');
  for(const k of ['claim_id','task_id','worker_id','authority_ref','input_ref'] as const) if(!nonempty(input[k])) issues.push(`${k} required`);
  if(!WORKER_LANES.includes(input.lane as WorkerLane)) issues.push('lane invalid');
  if(!generation(input.generation)) issues.push('generation invalid');
  if(!Array.isArray(input.evidence_refs)||input.evidence_refs.some(x=>!nonempty(x))) issues.push('evidence_refs invalid');
  if(!WORKER_STATES.includes(input.state as WorkerState)) issues.push('state invalid');
  if(!stamp(input.claimed_at)) issues.push('claimed_at invalid');
  if(!(input.released_at===null||stamp(input.released_at))) issues.push('released_at invalid');
  if(input.state==='RELEASED'&&input.released_at===null) issues.push('released worker requires released_at');
  return {ok:issues.length===0,issues};
}

export function validateWorkerResult(input:unknown):WorkerValidationResult{
  const issues:string[]=[];
  if(!obj(input)) return {ok:false,issues:['$ must be object']};
  if(input.schema_version!=='kiyusama-worker-result/2.0-draft1') issues.push('schema_version invalid');
  for(const k of ['claim_id','task_id','worker_id'] as const) if(!nonempty(input[k])) issues.push(`${k} required`);
  if(!generation(input.generation)) issues.push('generation invalid');
  if(!['SUCCEEDED','FAILED','AMBIGUOUS'].includes(String(input.state))) issues.push('state invalid');
  if(!(input.output_ref===null||nonempty(input.output_ref))) issues.push('output_ref invalid');
  if(!Array.isArray(input.evidence_refs)||input.evidence_refs.some(x=>!nonempty(x))) issues.push('evidence_refs invalid');
  if(!(input.error===null||nonempty(input.error))) issues.push('error invalid');
  if(!stamp(input.completed_at)) issues.push('completed_at invalid');
  if(input.state==='SUCCEEDED'&&input.output_ref===null) issues.push('success requires output_ref');
  if(input.state==='SUCCEEDED'&&(!Array.isArray(input.evidence_refs)||input.evidence_refs.length===0)) issues.push('success requires evidence');
  if(input.state==='FAILED'&&input.error===null) issues.push('failure requires error');
  if(input.state==='AMBIGUOUS'&&input.error===null) issues.push('ambiguity requires explanation');
  return {ok:issues.length===0,issues};
}
