import test from "node:test";
import assert from "node:assert/strict";
import {githubAppPresencePreflight as preflight} from "./github-app-presence-preflight.mjs";
const url="https://example.invalid/?preflight=github-app-presence-v1";
const req=(auth="Bearer test-root",method="POST",u=url)=>new Request(u,{method,headers:{Authorization:auth}});
test("authorized presence returns booleans without values",async()=>{
 const values={SUPABASE_SERVICE_ROLE_KEY:"test-root",GITHUB_APP_ID:"fake-app",GITHUB_APP_PRIVATE_KEY:"fake-private"};
 const r=await preflight(req(),{get:n=>values[n]}); const s=await r.text();
 assert.equal(r.status,200); assert.equal(r.headers.get("cache-control"),"no-store");
 assert.deepEqual(JSON.parse(s),{ok:true,evidence:"CONFIGURATION_PRESENCE_ONLY",has_github_app_id:true,has_github_app_private_key:true});
 for(const value of Object.values(values)) assert.equal(s.includes(value),false);
});
test("missing and whitespace configuration remain false",async()=>{
 const r=await preflight(req(),{get:n=>n==="SUPABASE_SERVICE_ROLE_KEY"?"test-root":" "});
 assert.equal((await r.json()).has_github_app_id,false);
});
test("unauthorized does not inspect App variables",async()=>{
 const reads=[]; const r=await preflight(req("Bearer wrong"),{get:n=>{reads.push(n);return "test-root";}});
 assert.equal(r.status,401); assert.deepEqual(reads,["SUPABASE_SERVICE_ROLE_KEY"]);
});
test("missing authentication root fails closed",async()=>{
 const r=await preflight(req(),{get:()=>undefined}); assert.equal(r.status,401);
});
test("wrong method reads no environment",async()=>{
 const r=await preflight(req("Bearer test-root","GET"),{get:()=>{throw Error("unexpected env read");}});
 assert.equal(r.status,405);
});
test("unrelated request is untouched",async()=>{
 assert.equal(await preflight(req("Bearer test-root","POST","https://example.invalid/"),{get:()=>{throw Error("unexpected env read");}}),null);
});
