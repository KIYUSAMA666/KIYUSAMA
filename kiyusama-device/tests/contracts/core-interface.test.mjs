import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoreInterfaceEnvelope } from '../../dist/contracts/core-interface.js';

const base={schema_version:'kiyusama-core-interface/2.0-draft1',event_id:'evt-1',correlation_id:'corr-1',source_plane:'SIGNAL',target_plane:'EXECUTION',action:'DISPATCH',actor:'SORA',authority_ref:'auth-1',evidence_refs:['signal:1'],side_effect_state:'REQUESTED',payload_ref:'payload:1',created_at:'2026-09-06T19:00:00+09:00'};
test('accepts authorized cross-plane dispatch',()=>assert.equal(validateCoreInterfaceEnvelope(base).ok,true));
test('rejects stateful action without authority',()=>assert.equal(validateCoreInterfaceEnvelope({...base,authority_ref:null}).ok,false));
test('rejects confirmed side effect without evidence',()=>assert.equal(validateCoreInterfaceEnvelope({...base,side_effect_state:'CONFIRMED',evidence_refs:[]}).ok,false));
test('preserves UNKNOWN side-effect state as valid explicit state',()=>assert.equal(validateCoreInterfaceEnvelope({...base,side_effect_state:'UNKNOWN'}).ok,true));
