import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkerClaim, validateWorkerResult } from '../../dist/contracts/worker-fabric.js';

const claim={schema_version:'kiyusama-worker-claim/2.0-draft1',claim_id:'claim-1',task_id:'task-1',worker_id:'codex-1',lane:'IMPLEMENT',generation:1,authority_ref:'auth-1',input_ref:'input:1',evidence_refs:['route:1'],state:'CLAIMED',claimed_at:'2026-09-06T19:00:00+09:00',released_at:null};
test('accepts traceable worker claim',()=>assert.equal(validateWorkerClaim(claim).ok,true));
test('rejects claim without authority',()=>assert.equal(validateWorkerClaim({...claim,authority_ref:''}).ok,false));
test('rejects stale/invalid generation zero',()=>assert.equal(validateWorkerClaim({...claim,generation:0}).ok,false));
test('released worker requires release timestamp',()=>assert.equal(validateWorkerClaim({...claim,state:'RELEASED'}).ok,false));

const result={schema_version:'kiyusama-worker-result/2.0-draft1',claim_id:'claim-1',task_id:'task-1',worker_id:'codex-1',generation:1,state:'SUCCEEDED',output_ref:'output:1',evidence_refs:['artifact:1'],error:null,completed_at:'2026-09-06T19:01:00+09:00'};
test('accepts evidenced worker success',()=>assert.equal(validateWorkerResult(result).ok,true));
test('rejects success without evidence',()=>assert.equal(validateWorkerResult({...result,evidence_refs:[]}).ok,false));
test('ambiguity must remain explicit',()=>assert.equal(validateWorkerResult({...result,state:'AMBIGUOUS',output_ref:null,evidence_refs:[],error:'provider response lost after request'}).ok,true));
