// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveFreshSoraActorCanonical,
  SORA_ACTOR_CURRENT_FRESHNESS_V01,
} from "../src/sora-actor-current-freshness.js";

const now = Date.parse("2026-09-30T20:00:00Z");
const hour = 60 * 60 * 1000;

function rec(id, createdBy, createdAt, status = "ACTIVE", conflictFlag = false) {
  return { id, createdBy, createdAt, status, conflictFlag };
}

test("1 resolves newest fresh canonical for exact actor", () => {
  const r = resolveFreshSoraActorCanonical([
    rec(10, "SORA_07", "2026-09-30T19:10:00Z"),
    rec(11, "SORA_07", "2026-09-30T19:50:00Z"),
    rec(99, "SORA_08", "2026-09-30T19:59:00Z"),
  ], 7, now, hour);
  assert.equal(r.status, "RESOLVED");
  assert.equal(r.record.id, 11);
  assert.equal(r.resolutionVersion, SORA_ACTOR_CURRENT_FRESHNESS_V01);
});

test("2 missing actor canonical holds", () => {
  const r = resolveFreshSoraActorCanonical([
    rec(99, "SORA_08", "2026-09-30T19:59:00Z"),
  ], 7, now, hour);
  assert.deepEqual(r, {
    status: "HOLD",
    reason: "NO_CANONICAL",
    resolutionVersion: SORA_ACTOR_CURRENT_FRESHNESS_V01,
  });
});

test("3 stale canonical holds and is never promoted to CURRENT", () => {
  const r = resolveFreshSoraActorCanonical([
    rec(850, "SORA_07", "2026-09-27T17:39:04Z"),
  ], 7, now, hour);
  assert.equal(r.status, "HOLD");
  assert.equal(r.reason, "STALE_CANONICAL");
});

test("4 conflicted or non-active rows cannot become canonical", () => {
  const r = resolveFreshSoraActorCanonical([
    rec(1, "SORA_07", "2026-09-30T19:59:00Z", "ACTIVE", true),
    rec(2, "SORA_07", "2026-09-30T19:59:30Z", "CLOSED", false),
  ], 7, now, hour);
  assert.equal(r.status, "HOLD");
  assert.equal(r.reason, "NO_CANONICAL");
});

test("5 retrieval order has no authority", () => {
  const a = rec(20, "SORA_07", "2026-09-30T19:55:00Z");
  const b = rec(21, "SORA_07", "2026-09-30T19:56:00Z");
  const x = resolveFreshSoraActorCanonical([b, a], 7, now, hour);
  const y = resolveFreshSoraActorCanonical([a, b], 7, now, hour);
  assert.equal(x.status, "RESOLVED");
  assert.equal(y.status, "RESOLVED");
  assert.equal(x.record.id, 21);
  assert.equal(y.record.id, 21);
});

test("6 same timestamp uses durable id as deterministic tie-breaker", () => {
  const r = resolveFreshSoraActorCanonical([
    rec(30, "SORA_07", "2026-09-30T19:58:00Z"),
    rec(31, "SORA_07", "2026-09-30T19:58:00Z"),
  ], 7, now, hour);
  assert.equal(r.status, "RESOLVED");
  assert.equal(r.record.id, 31);
});

test("7 malformed candidate fails closed", () => {
  const r = resolveFreshSoraActorCanonical([
    rec(1, "SORA_07", "not-a-time"),
  ], 7, now, hour);
  assert.equal(r.status, "HOLD");
  assert.equal(r.reason, "INVALID_RECORD");
});

test("8 future timestamp fails closed", () => {
  const r = resolveFreshSoraActorCanonical([
    rec(1, "SORA_07", "2026-09-30T20:01:00Z"),
  ], 7, now, hour);
  assert.equal(r.status, "HOLD");
  assert.equal(r.reason, "STALE_CANONICAL");
});
