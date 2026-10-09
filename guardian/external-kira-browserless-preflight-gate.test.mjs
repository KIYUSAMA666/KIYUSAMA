import test from "node:test";import assert from "node:assert/strict";import {classifyExternalBodyPreflight as check} from "./external-kira-browserless-preflight-gate.mjs";
const expected={provider:"claude.ai",targetUrl:"https://claude.ai/chat/b2ed0bb2-82f9-4d4e-8fe8-5626023086dc"};
const observed={finalUrl:expected.targetUrl,loginPromptVisible:false,passwordInputCount:0,composerCount:1,composerVisible:true,readOnly:true,sendCount:0,sessionBoundToExpectedAccount:true};
test("all read-only evidence qualifies preflight only",()=>assert.equal(check(expected,observed).status,"PREFLIGHT_ELIGIBLE"));
test("wrong conversation blocked",()=>assert.equal(check(expected,{...observed,finalUrl:"https://claude.ai/new"}).reason,"EXACT_CHAT_NOT_REACHED"));
test("login blocked",()=>assert.equal(check(expected,{...observed,loginPromptVisible:true}).reason,"AUTH_UNPROVEN"));
test("missing composer blocked",()=>assert.equal(check(expected,{...observed,composerCount:0}).reason,"COMPOSER_UNPROVEN"));
test("unproven account blocked",()=>assert.equal(check(expected,{...observed,sessionBoundToExpectedAccount:false}).reason,"ACCOUNT_BINDING_UNPROVEN"));
test("send side-effect blocked",()=>assert.equal(check(expected,{...observed,sendCount:1}).reason,"PREFLIGHT_SIDE_EFFECT"));
