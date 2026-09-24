import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveArtifactRecoveryView } from '../../dist/contracts/artifact-memory.js';
const t1='2026-09-03T09:13:00+09:00',t2='2026-09-03T09:14:00+09:00';
const rec=(version,state,transition,artifact_id='A',recorded_at=t1)=>({schema_version:'kiyusama-memory-continuation/2.0-draft1',memory_id:`m${version}`,subject:'Artifact A',state,previous_state:version===1?null:'BORN',cause:'test',evidence_refs:[{ref:`e:${version}`}],version,freshness_at:recorded_at,source:'SORA',verification_status:'VERIFIED',salience:'CORE',next_action:'continue',recorded_at,artifact_id,transition,observed_at:recorded_at});
const edge={schema_version:'kiyusama-artifact-lineage/2.0-draft1',lineage_edge_id:'e1',parent_artifact_id:'A',child_artifact_ids:['B','C'],transition_type:'DECOMPOSED',evidence_refs:[{ref:'lineage:1'}],verification_status:'VERIFIED',recorded_at:t2};
test('recovery view resolves latest artifact memory and descendants',()=>{const r=resolveArtifactRecoveryView('A',[rec(1,'BORN','BORN', 'A', t1),rec(2,'ANALYZED','MODIFIED','A',t2)],[edge]);assert.equal(r.current_memory.version,2);assert.deepEqual(r.lineage.descendants,['B','C']);assert.deepEqual(r.unresolved_descendants,['B','C'])});
test('known child is not unresolved',()=>{const child=rec(1,'BORN','BORN','B',t2);const r=resolveArtifactRecoveryView('A',[rec(1,'BORN','BORN','A',t1),child],[edge]);assert.deepEqual(r.unresolved_descendants,['C'])});
test('broken artifact version chain is rejected',()=>assert.throws(()=>resolveArtifactRecoveryView('A',[rec(1,'BORN','BORN','A',t1),rec(3,'ANALYZED','MODIFIED','A',t2)],[]),/BROKEN_ARTIFACT_MEMORY_CHAIN/));
