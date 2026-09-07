import test from'node:test';import assert from'node:assert/strict';import{evaluateOs2Completion}from'../../dist/contracts/completion-gate.js';
const all={contracts_pass:true,integration_pass:true,kernel_boot_pass:true,memory_engine_pass:true,artifact_lifecycle_pass:true,artifact_lineage_pass:true,artifact_recovery_pass:true,retrieve_first_continuation_pass:true,worker_fabric_pass:true,counter_lane_pass:true,tonton_boundary_pass:true,destructive_lock_intact:true,production_untouched:true};
test('completion requires every executable gate',()=>assert.equal(evaluateOs2Completion(all).complete,true));
test('missing test evidence prevents completion claim',()=>assert.equal(evaluateOs2Completion({...all,contracts_pass:false}).complete,false));
test('artifact recovery cannot be skipped',()=>{const r=evaluateOs2Completion({...all,artifact_recovery_pass:false});assert.equal(r.complete,false);assert.ok(r.missing.includes('artifact_recovery_pass'))});
test('artifact lineage cannot be skipped',()=>assert.equal(evaluateOs2Completion({...all,artifact_lineage_pass:false}).complete,false));
test('retrieve-first continuation cannot be skipped',()=>{const r=evaluateOs2Completion({...all,retrieve_first_continuation_pass:false});assert.equal(r.complete,false);assert.ok(r.missing.includes('retrieve_first_continuation_pass'))});
