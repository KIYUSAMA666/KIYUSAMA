export const COUNTER_CHECKS = ['NODE','EDGE','LOOP','ABSENCE'] as const;
export type CounterCheck = (typeof COUNTER_CHECKS)[number];
export const COUNTER_VERDICTS = ['PASS','FAIL','AMBIGUOUS'] as const;
export type CounterVerdict = (typeof COUNTER_VERDICTS)[number];

export interface CounterAudit {
  schema_version:'kiyusama-counter-audit/2.0-draft1';
  audit_id:string;
  subject_ref:string;
  producer:string;
  auditor:string;
  checks:CounterCheck[];
  evidence_refs:string[];
  freshness_at:string;
  independent_recount:boolean;
  verdict:CounterVerdict;
  findings:string[];
  audited_at:string;
}
export interface CounterValidationResult { ok:boolean; issues:string[] }
const s=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const o=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const t=(v:unknown):v is string=>s(v)&&!Number.isNaN(Date.parse(v));
export function validateCounterAudit(input:unknown):CounterValidationResult{
  const issues:string[]=[];
  if(!o(input)) return {ok:false,issues:['$ must be object']};
  if(input.schema_version!=='kiyusama-counter-audit/2.0-draft1') issues.push('schema_version invalid');
  for(const k of ['audit_id','subject_ref','producer','auditor'] as const) if(!s(input[k])) issues.push(`${k} required`);
  if(s(input.producer)&&s(input.auditor)&&input.producer===input.auditor) issues.push('aggregator/producer shall not audit itself');
  if(!Array.isArray(input.checks)||input.checks.length===0||input.checks.some(x=>!COUNTER_CHECKS.includes(x as CounterCheck))) issues.push('checks invalid');
  if(!Array.isArray(input.evidence_refs)||input.evidence_refs.some(x=>!s(x))) issues.push('evidence_refs invalid');
  if(!t(input.freshness_at)) issues.push('freshness_at invalid');
  if(input.independent_recount!==true) issues.push('independent_recount required');
  if(!COUNTER_VERDICTS.includes(input.verdict as CounterVerdict)) issues.push('verdict invalid');
  if(!Array.isArray(input.findings)||input.findings.some(x=>!s(x))) issues.push('findings invalid');
  if(!t(input.audited_at)) issues.push('audited_at invalid');
  if(input.verdict==='PASS'&&(!Array.isArray(input.evidence_refs)||input.evidence_refs.length===0)) issues.push('PASS requires evidence');
  if((input.verdict==='FAIL'||input.verdict==='AMBIGUOUS')&&(!Array.isArray(input.findings)||input.findings.length===0)) issues.push('non-PASS requires findings');
  return {ok:issues.length===0,issues};
}
