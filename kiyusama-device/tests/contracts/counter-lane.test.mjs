import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCounterAudit } from '../../dist/contracts/counter-lane.js';
const base={schema_version:'kiyusama-counter-audit/2.0-draft1',audit_id:'audit-1',subject_ref:'commit:abc',producer:'SORA',auditor:'KIRA',checks:['NODE','EDGE','LOOP','ABSENCE'],evidence_refs:['commit:abc','test:contracts'],freshness_at:'2026-09-06T20:00:00+09:00',independent_recount:true,verdict:'PASS',findings:[],audited_at:'2026-09-06T20:01:00+09:00'};
test('accepts independent evidenced recount',()=>assert.equal(validateCounterAudit(base).ok,true));
test('rejects self audit',()=>assert.equal(validateCounterAudit({...base,auditor:'SORA'}).ok,false));
test('PASS requires evidence',()=>assert.equal(validateCounterAudit({...base,evidence_refs:[]}).ok,false));
test('independent recount cannot be skipped',()=>assert.equal(validateCounterAudit({...base,independent_recount:false}).ok,false));
test('failure requires findings',()=>assert.equal(validateCounterAudit({...base,verdict:'FAIL',findings:[]}).ok,false));
