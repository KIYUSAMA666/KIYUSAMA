import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMemoryContinuationRecord } from '../../dist/contracts/memory-continuation.js';
import { validateCoreInterfaceEnvelope } from '../../dist/contracts/core-interface.js';
import { validateWorkerClaim, validateWorkerResult } from '../../dist/contracts/worker-fabric.js';
import { validateCounterAudit } from '../../dist/contracts/counter-lane.js';
import { validateTontonBoundaryEvent, validateTontonBoundaryResult } from '../../dist/contracts/tonton-boundary.js';
import { computeIntegrationPass } from '../../dist/contracts/completion-gate.js';

const at='2026-09-06T20:20:00+09:00';
const memory={schema_version:'kiyusama-memory-continuation/2.0-draft1',memory_id:'m1',subject:'task',state:'READY',previous_state:null,cause:'verified input',evidence_refs:[{ref:'input:1'}],version:1,freshness_at:at,source:'COMMON_MEMORY',verification_status:'VERIFIED',salience:'CORE',next_action:'dispatch task',recorded_at:at};
const core_event={schema_version:'kiyusama-core-interface/2.0-draft1',event_id:'e1',correlation_id:'c1',source_plane:'MEMORY',target_plane:'WORKER',action:'DISPATCH',actor:'SORA',authority_ref:'auth:1',evidence_refs:['input:1'],side_effect_state:'REQUESTED',payload_ref:'task:1',created_at:at};
const worker_claim={schema_version:'kiyusama-worker-claim/2.0-draft1',claim_id:'cl1',task_id:'t1',worker_id:'codex-s',lane:'IMPLEMENT',generation:1,authority_ref:'auth:1',input_ref:'task:1',evidence_refs:['e1'],state:'CLAIMED',claimed_at:at,released_at:null};
const worker_result={schema_version:'kiyusama-worker-result/2.0-draft1',claim_id:'cl1',task_id:'t1',worker_id:'codex-s',generation:1,state:'SUCCEEDED',output_ref:'branch:1',evidence_refs:['commit:1'],error:null,completed_at:at};
const counter_audit={schema_version:'kiyusama-counter-audit/2.0-draft1',audit_id:'a1',subject_ref:'commit:1',producer:'CODEX-S',auditor:'KIRA',checks:['NODE','EDGE','LOOP','ABSENCE'],evidence_refs:['commit:1'],freshness_at:at,independent_recount:true,verdict:'PASS',findings:[],audited_at:at};
const tonton_event={schema_version:'tonton-boundary/2.0-draft1',event_id:'out1',correlation_id:'c1',source:'WORKER',target:'MAILBOX',intent:'deliver verified result',payload_ref:'branch:1',evidence_refs:['commit:1'],created_at:at};
const tonton_result={schema_version:'tonton-boundary-result/2.0-draft1',event_id:'out1',correlation_id:'c1',outcome:'DELIVERED',delivery_ref:'mailbox:1',evidence_refs:['receipt:1'],state_update_ref:'memory:m1:v2',error:null,completed_at:at};
const chain={memory,core_event,worker_claim,worker_result,counter_audit,tonton_event,tonton_result};

test('OS2 causal chain validates across memory signal worker counter and TONTON boundary',()=>{
  assert.equal(validateMemoryContinuationRecord(memory).ok,true);
  assert.equal(validateCoreInterfaceEnvelope(core_event).ok,true);
  assert.equal(validateWorkerClaim(worker_claim).ok,true);
  assert.equal(validateWorkerResult(worker_result).ok,true);
  assert.equal(validateCounterAudit(counter_audit).ok,true);
  assert.equal(validateTontonBoundaryEvent(tonton_event).ok,true);
  assert.equal(validateTontonBoundaryResult(tonton_result).ok,true);
});

test('integration_pass is derived from the complete causal chain',()=>assert.equal(computeIntegrationPass(chain),true));
test('integration fails when memory evidence is not carried into core event',()=>assert.equal(computeIntegrationPass({...chain,core_event:{...core_event,evidence_refs:['other:1']}}),false));
test('integration fails when core payload does not match worker input',()=>assert.equal(computeIntegrationPass({...chain,worker_claim:{...worker_claim,input_ref:'task:other'}}),false));
test('integration fails when worker result belongs to another claim',()=>assert.equal(computeIntegrationPass({...chain,worker_result:{...worker_result,claim_id:'cl-other'}}),false));
test('integration fails when counter audit does not audit worker evidence',()=>assert.equal(computeIntegrationPass({...chain,counter_audit:{...counter_audit,subject_ref:'commit:other'}}),false));
test('integration fails when TONTON delivers a different payload',()=>assert.equal(computeIntegrationPass({...chain,tonton_event:{...tonton_event,payload_ref:'branch:other'}}),false));
test('integration fails when TONTON result correlation breaks',()=>assert.equal(computeIntegrationPass({...chain,tonton_result:{...tonton_result,correlation_id:'c-other'}}),false));
test('integration fails closed on non-PASS audit',()=>assert.equal(computeIntegrationPass({...chain,counter_audit:{...counter_audit,verdict:'FAIL',findings:['independent audit rejected result']}}),false));
