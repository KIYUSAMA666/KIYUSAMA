import test from'node:test';import assert from'node:assert/strict';import{retryCredit}from'../../dist/contracts/retry-credit.js';
test('same evidence earns no retry credit',()=>assert.deepEqual(retryCredit({previous_evidence_refs:['ev-1'],current_evidence_refs:['ev-1']}),{verdict:'NO_CREDIT',new_evidence_refs:[]}));
test('reordered or duplicated old evidence earns no retry credit',()=>assert.deepEqual(retryCredit({previous_evidence_refs:['ev-1','ev-2'],current_evidence_refs:['ev-2','ev-1','ev-2']}),{verdict:'NO_CREDIT',new_evidence_refs:[]}));
test('new evidence earns retry credit and identifies only new refs',()=>assert.deepEqual(retryCredit({previous_evidence_refs:['ev-1'],current_evidence_refs:['ev-1','ev-2']}),{verdict:'CREDIT',new_evidence_refs:['ev-2']}));
