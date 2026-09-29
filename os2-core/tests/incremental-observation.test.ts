// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  INCREMENTAL_OBSERVATION_V01,
  selectIncrementalObservationMetadata,
} from "../src/incremental-observation.js";

function row(id, overrides = {}) {
  return {
    id,
    createdAt: "2026-09-30T20:00:00Z",
    createdBy: "SORA_03",
    subjectKey: "central.nerve",
    status: "ACTIVE",
    conflictFlag: false,
    ...overrides,
  };
}

test("1 only ids above high-water are returned", () => {
  const r = selectIncrementalObservationMetadata([row(932), row(934), row(933)], 932);
  assert.equal(r.status, "NEW_METADATA");
  assert.deepEqual(r.records.map((x) => x.id), [933, 934]);
  assert.equal(r.highWaterId, 934);
  assert.equal(r.version, INCREMENTAL_OBSERVATION_V01);
});

test("2 empty delta is explicitly NO_NEW_METADATA", () => {
  const r = selectIncrementalObservationMetadata([row(931), row(932)], 932);
  assert.deepEqual(r, {
    status: "NO_NEW_METADATA",
    highWaterId: 932,
    version: INCREMENTAL_OBSERVATION_V01,
  });
});

test("3 observation failure cannot be represented as empty input with advanced cursor", () => {
  const r = selectIncrementalObservationMetadata([], 932);
  assert.equal(r.status, "NO_NEW_METADATA");
  assert.equal(r.highWaterId, 932);
});

test("4 malformed metadata fails closed", () => {
  const r = selectIncrementalObservationMetadata([row(933, { createdAt: "bad" })], 932);
  assert.equal(r.status, "HOLD");
  assert.equal(r.reason, "INVALID_METADATA");
});

test("5 invalid high-water fails closed", () => {
  const r = selectIncrementalObservationMetadata([row(933)], -1);
  assert.equal(r.status, "HOLD");
  assert.equal(r.reason, "INVALID_HIGH_WATER");
});

test("6 metadata selection does not require content/body", () => {
  const r = selectIncrementalObservationMetadata([row(933)], 932);
  assert.equal(r.status, "NEW_METADATA");
  assert.equal(Object.hasOwn(r.records[0], "content"), false);
});
