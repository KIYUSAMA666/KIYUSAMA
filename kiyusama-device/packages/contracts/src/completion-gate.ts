import { validateArtifactLineageEdge, type ArtifactLineageEdge } from './artifact-lineage.js';
import { resolveArtifactRecoveryView, type ArtifactMemoryRecord } from './artifact-memory.js';
import { resolveLifecycleCurrentState, type LifecycleTransition } from './lifecycle-memory.js';
import { recoveryGate } from './recovery-gate.js';
import { validateMemoryContinuationRecord, type MemoryContinuationRecord } from './memory-continuation.js';
import { validateCoreInterfaceEnvelope, type CoreInterfaceEnvelope } from './core-interface.js';
import { validateWorkerClaim, validateWorkerResult, type WorkerClaim, type WorkerResult } from './worker-fabric.js';
import { validateCounterAudit, type CounterAudit } from './counter-lane.js';
import { validateTontonBoundaryEvent, validateTontonBoundaryResult, type TontonBoundaryEvent, type TontonBoundaryResult } from './tonton-boundary.js';

export interface CompletionEvidence{
  contracts_pass:boolean;
  integration_pass:boolean;
  kernel_boot_pass:boolean;
  memory_engine_pass:boolean;
  artifact_lifecycle_pass:boolean;
  artifact_lineage_pass:boolean;
  artifact_recovery_pass:boolean;
  retrieve_first_continuation_pass:boolean;
  worker_fabric_pass:boolean;
  counter_lane_pass:boolean;
  tonton_boundary_pass:boolean;
  destructive_lock_intact:boolean;
  production_untouched:boolean;
}

export interface ArtifactCompletionEvidence{
  artifact_lifecycle_pass:boolean;
  artifact_lineage_pass:boolean;
  artifact_recovery_pass:boolean;
  retrieve_first_continuation_pass:boolean;
}

export interface ArtifactCompletionInput{
  artifact_id:string;
  lineage_edges:ArtifactLineageEdge[];
  artifact_memory_records:ArtifactMemoryRecord[];
  lifecycle_history:LifecycleTransition[];
}

export interface IntegrationCompletionInput{
  memory:MemoryContinuationRecord;
  core_event:CoreInterfaceEnvelope;
  worker_claim:WorkerClaim;
  worker_result:WorkerResult;
  counter_audit:CounterAudit;
  tonton_event:TontonBoundaryEvent;
  tonton_result:TontonBoundaryResult;
}

export function computeIntegrationPass(input:IntegrationCompletionInput):boolean{
  try{
    if(!validateMemoryContinuationRecord(input.memory).ok)return false;
    if(!validateCoreInterfaceEnvelope(input.core_event).ok)return false;
    if(!validateWorkerClaim(input.worker_claim).ok)return false;
    if(!validateWorkerResult(input.worker_result).ok)return false;
    if(!validateCounterAudit(input.counter_audit).ok)return false;
    if(!validateTontonBoundaryEvent(input.tonton_event).ok)return false;
    if(!validateTontonBoundaryResult(input.tonton_result).ok)return false;

    const memoryEvidence=new Set(input.memory.evidence_refs.map(x=>x.ref));
    if(!input.core_event.evidence_refs.some(ref=>memoryEvidence.has(ref)))return false;
    if(input.core_event.action!=='DISPATCH')return false;
    if(input.core_event.target_plane!=='WORKER')return false;
    if(input.core_event.payload_ref!==input.worker_claim.input_ref)return false;
    if(input.core_event.authority_ref!==input.worker_claim.authority_ref)return false;

    if(input.worker_result.claim_id!==input.worker_claim.claim_id)return false;
    if(input.worker_result.task_id!==input.worker_claim.task_id)return false;
    if(input.worker_result.worker_id!==input.worker_claim.worker_id)return false;
    if(input.worker_result.generation!==input.worker_claim.generation)return false;
    if(input.worker_result.state!=='SUCCEEDED'||input.worker_result.output_ref===null)return false;

    if(input.counter_audit.verdict!=='PASS')return false;
    if(!input.worker_result.evidence_refs.includes(input.counter_audit.subject_ref))return false;

    if(input.tonton_event.correlation_id!==input.core_event.correlation_id)return false;
    if(input.tonton_event.payload_ref!==input.worker_result.output_ref)return false;
    if(!input.tonton_event.evidence_refs.includes(input.counter_audit.subject_ref))return false;

    if(input.tonton_result.event_id!==input.tonton_event.event_id)return false;
    if(input.tonton_result.correlation_id!==input.tonton_event.correlation_id)return false;
    if(input.tonton_result.outcome!=='DELIVERED')return false;

    return true;
  }catch{
    return false;
  }
}

export function computeArtifactCompletionEvidence(input:ArtifactCompletionInput):ArtifactCompletionEvidence{
  let artifact_lifecycle_pass=false;
  let artifact_lineage_pass=false;
  let artifact_recovery_pass=false;
  let retrieve_first_continuation_pass=false;

  try{
    if(input.lifecycle_history.length===0)throw new Error('EMPTY_LIFECYCLE');
    resolveLifecycleCurrentState(input.lifecycle_history);
    artifact_lifecycle_pass=true;
  }catch{
    artifact_lifecycle_pass=false;
  }

  try{
    if(input.lineage_edges.length===0)throw new Error('EMPTY_LINEAGE');
    input.lineage_edges.forEach(validateArtifactLineageEdge);
    artifact_lineage_pass=true;
  }catch{
    artifact_lineage_pass=false;
  }

  try{
    if(input.artifact_memory_records.length===0)throw new Error('EMPTY_ARTIFACT_MEMORY');
    const view=resolveArtifactRecoveryView(input.artifact_id,input.artifact_memory_records,input.lineage_edges);
    artifact_recovery_pass=view.current_memory!==null&&view.unresolved_descendants.length===0;
    retrieve_first_continuation_pass=recoveryGate(view.current_memory??undefined).allow===true;
  }catch{
    artifact_recovery_pass=false;
    retrieve_first_continuation_pass=false;
  }

  return{
    artifact_lifecycle_pass,
    artifact_lineage_pass,
    artifact_recovery_pass,
    retrieve_first_continuation_pass,
  };
}

export function evaluateOs2Completion(e:CompletionEvidence){
  const missing=Object.entries(e).filter(([,v])=>v!==true).map(([k])=>k);
  return{complete:missing.length===0,missing};
}
