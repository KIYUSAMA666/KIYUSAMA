import test from 'node:test';import assert from 'node:assert/strict';import{validateTontonBoundaryEvent,validateTontonBoundaryResult}from'../../dist/contracts/tonton-boundary.js';
const event={schema_version:'tonton-boundary/2.0-draft1',event_id:'e1',correlation_id:'c1',source:'SORA',target:'KIRA',intent:'review',payload_ref:'payload:1',evidence_refs:['signal:1'],created_at:'2026-09-06T20:10:00+09:00'};
test('accepts topology-neutral boundary event',()=>assert.equal(validateTontonBoundaryEvent(event).ok,true));
const result={schema_version:'tonton-boundary-result/2.0-draft1',event_id:'e1',correlation_id:'c1',outcome:'DELIVERED',delivery_ref:'mailbox:1',evidence_refs:['receipt:1'],state_update_ref:'memory:1',error:null,completed_at:'2026-09-06T20:11:00+09:00'};
test('DELIVERED requires delivery evidence',()=>assert.equal(validateTontonBoundaryResult(result).ok,true));
test('rejects false delivered without evidence',()=>assert.equal(validateTontonBoundaryResult({...result,evidence_refs:[]}).ok,false));
test('ambiguity remains explicit',()=>assert.equal(validateTontonBoundaryResult({...result,outcome:'AMBIGUOUS',delivery_ref:null,evidence_refs:[],state_update_ref:null,error:'provider outcome unknown'}).ok,true));
