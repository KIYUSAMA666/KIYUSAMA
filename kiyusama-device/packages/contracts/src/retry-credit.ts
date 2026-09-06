export type RetryCreditVerdict='CREDIT'|'NO_CREDIT';
export interface RetryCreditInput{previous_evidence_refs:string[];current_evidence_refs:string[]}
const clean=(refs:string[])=>new Set(refs.filter(x=>typeof x==='string'&&x.trim().length>0));
export function retryCredit(input:RetryCreditInput):{verdict:RetryCreditVerdict;new_evidence_refs:string[]}{
  const previous=clean(input.previous_evidence_refs);
  const current=clean(input.current_evidence_refs);
  const added=[...current].filter(ref=>!previous.has(ref));
  return added.length>0?{verdict:'CREDIT',new_evidence_refs:added}:{verdict:'NO_CREDIT',new_evidence_refs:[]};
}
