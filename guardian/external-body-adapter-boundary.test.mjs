import test from "node:test";
import assert from "node:assert/strict";
import { createExternalBodyAdapterBoundary, assertNoRawSendSurface, AdapterBoundaryError } from "./external-body-adapter-boundary.mjs";

test("adapter public boundary exposes Guardian send, not raw SEND",()=>{
 const cap={send:async x=>"guardian:"+x};
 const adapter=createExternalBodyAdapterBoundary({guardianCapability:cap,observe:()=>1,compose:()=>2,capture:()=>3});
 assert.deepEqual(Object.keys(adapter).sort(),["capture","compose","observe","send"]);
 assert.equal(assertNoRawSendSurface(adapter),true);
 assert.equal("rawSend" in adapter,false);
 assert.equal("driver" in adapter,false);
 assert.equal("page" in adapter,false);
});

test("adapter SEND delegates only to Guardian capability",async()=>{
 let guardian=0;
 const adapter=createExternalBodyAdapterBoundary({guardianCapability:{send:async p=>{guardian++; return p;}}});
 assert.equal(await adapter.send("payload"),"payload");
 assert.equal(guardian,1);
});

test("boundary cannot be constructed without Guardian capability",()=>{
 assert.throws(()=>createExternalBodyAdapterBoundary({}),e=>e instanceof AdapterBoundaryError&&e.reason==="GUARDIAN_CAPABILITY_REQUIRED");
});

test("raw SEND shaped surface is detected fail-closed",()=>{
 assert.throws(()=>assertNoRawSendSurface({send(){},rawSend(){}}),AdapterBoundaryError);
});
