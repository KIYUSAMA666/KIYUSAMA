import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL, GATEWAY_URL, validateWork, selectTab, extractResult, runCycle, oidcGateway } from '../scripts/sora03-canonical-body.mjs';
// All message-role, lease and eligibility objects below are MOCK contracts.
// These tests do not establish live Bridge capabilities or runtime PASS.
const work = () => ({agent_id:'SORA_03',patrol_run_id:4729,latest_entry_id:1113,processed:false,unread_count:5,formal:{decision:'PASS',reason:'CANONICAL_ACTIVE',conflict:false,entry_id:1113},eligibility:{real_work:true,completion_only:false},ownership:{lease_id:'owned-test'}});
const snapshot = () => ({url:URL,title:'3号究極ソラ部屋',nodes:[{role:'textbox',selector:'div#prompt-textarea',ref:'e1'},{role:'button',name:'Send prompt',ref:'e2'}]});
const result = () => ({role:'assistant',complete:true,conversation_url:URL,marker:'SORA03_RESULT_4729_1113',patrol_run_id:4729,latest_entry_id:1113,body:'結果：日本語🔥 Evidence'});
test('processed/no unread/completion-only/current mismatch reject',()=>{
  for(const delta of [{processed:true},{unread_count:0},{eligibility:{real_work:true,completion_only:true}},{formal:{decision:'PASS',reason:'CANONICAL_ACTIVE',conflict:false,entry_id:1108}}]) assert.throws(()=>validateWork({...work(),...delta}));
});
test('exact URL and consistent duplicate tabs choose one',()=>{
  assert.equal(selectTab([{id:2,url:URL,title:'3号究極ソラ部屋'},{id:1,url:URL,title:'3号究極ソラ部屋'}]).id,1);
  assert.throws(()=>selectTab([{id:1,url:URL+'?other',title:'3号究極ソラ部屋'}]));
  assert.throws(()=>selectTab([{id:1,url:URL,title:'3号究極ソラ部屋'},{id:2,url:URL,title:'Work'}]));
});
test('user prompt marker cannot be RESULT; incomplete and duplicate fail',()=>{
  assert.throws(()=>extractResult([{...result(),role:'user'}],work()));
  assert.throws(()=>extractResult([{...result(),complete:false}],work()));
  assert.throws(()=>extractResult([result(),result()],work()));
  assert.equal(extractResult([result()],work()).body,'結果：日本語🔥 Evidence');
  assert.throws(()=>extractResult([{...result(),body:'🔥'.repeat(1501)}],work()),/COMMIT_LIMIT/);
});
test('OIDC token goes only to fixed existing GET/POST endpoint',async()=>{
  const calls=[]; const fake=async(u,o)=>{calls.push([u.href,o]);return{ok:true,json:async()=>({ok:true,work:[{agent_id:'SORA_03',id:4729,latest_entry_id:1113}]})};};
  const gateway=oidcGateway(GATEWAY_URL,'private-test-token',fake);
  assert.equal((await gateway.work()).work[0].id,4729);
  await gateway.commit({actor_id:'SORA_03',patrol_run_id:4729,latest_entry_id:1113,body:'日本語'});
  assert.deepEqual(calls.map(c=>[c[0],c[1].method]),[[GATEWAY_URL,'GET'],[GATEWAY_URL,'POST']]);
  assert.equal(JSON.parse(calls[1][1].body).actor_id,'SORA_03');
  assert.throws(()=>oidcGateway('https://attacker.example/work','private-test-token',fake),/INVALID_GATEWAY/);
  assert.throws(()=>oidcGateway(GATEWAY_URL+'?redirect=other','private-test-token',fake),/INVALID_GATEWAY/);
});
test('current real Bridge snapshot protocol fails before effect',async()=>{
  const calls=[];
  await assert.rejects(runCycle({gateway:{work:async()=>work()},bridge:async(tool)=>{calls.push(tool);return tool==='tab_list'?[{id:1,url:URL,title:'3号究極ソラ部屋'}]:snapshot();}}),/ROLE_ISOLATION_UNAVAILABLE/);
  assert.deepEqual(calls,['tab_list','page_snapshot']);
});
test('uncertain click creates durable intent and never resends',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'sora-journal-')); let clicks=0;
  const args={directory,gateway:{work:async()=>work(),commit:async()=>{throw Error('MUST_NOT_COMMIT');}},messageReader:{capability:'PROVEN_ROLE_AND_COMPLETION_V1',read:async()=>[]},verifyCommit:async()=>{},bridge:async(tool)=>{if(tool==='tab_list')return[{id:1,url:URL,title:'3号究極ソラ部屋'}];if(tool==='page_snapshot')return snapshot();if(tool==='page_click'){clicks++;throw Error('BRIDGE_TIMEOUT_UNCERTAIN');}return{ok:true};}};
  try {await assert.rejects(runCycle(args),/TIMEOUT_UNCERTAIN/);await assert.rejects(runCycle(args),/EEXIST/);assert.equal(clicks,1);}finally{await rm(directory,{recursive:true,force:true});}
});
test('completed assistant recovery commits Unicode once without SEND',async()=>{
  let commits=0,verified=false;
  const args={gateway:{work:async()=>work(),commit:async b=>{commits++;assert.equal(b.body,result().body);return{ok:true,acked_entry_id:1113};}},messageReader:{capability:'PROVEN_ROLE_AND_COMPLETION_V1',read:async()=>[result()]},verifyCommit:async()=>{verified=true;},bridge:async tool=>{if(tool==='tab_list')return[{id:1,url:URL,title:'3号究極ソラ部屋'}];if(tool==='page_snapshot')return snapshot();throw Error('NO_EFFECT_ALLOWED');}};
  assert.equal((await runCycle(args)).state,'CYCLE_VERIFIED');assert.equal(commits,1);assert.equal(verified,true);
});
