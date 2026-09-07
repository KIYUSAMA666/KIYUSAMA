import { validateArtifactLineageEdge, type ArtifactLineageEdge } from './artifact-lineage.js';
import { resolveArtifactRecoveryView, type ArtifactMemoryRecord } from './artifact-memory.js';
import { resolveLifecycleCurrentState, type LifecycleTransition } from './lifecycle-memory.js';
import { recoveryGate } from './recovery-gate.js';

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
