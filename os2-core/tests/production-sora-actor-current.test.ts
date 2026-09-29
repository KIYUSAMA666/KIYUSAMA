// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { resolveProductionSoraActorCurrent } from "../src/production-sora-actor-current.js";

const NOW = Date.parse("2026-09-30T05:30:00Z");
const HOUR = 60 * 60 * 1000;

function row(id, overrides = {}) {
  return {
    id,
    created_by: "SORA_07",
    created_at: "2026-09-30T05:00:00Z",
    status: "ACTIVE",
    conflict_flag: false,
    subject_key: "sora07.current",
    title: "7号 CURRENT",
    ...overrides,
  };
}

test("production adapter requests exact actor and resolves fresh canonical", async () => {
  let requested = "";
  const decision = await resolveProductionSoraActorCurrent(
    { async readActorMetadata(actor) { requested = actor; return [row(933)]; } },
    7, NOW, HOUR,
  );
  assert.equal(requested, "SORA_07");
  assert.equal(decision.status, "RESOLVED");
  assert.equal(decision.record.id, 933);
});

test("surface actor contamination fails closed before resolver", async () => {
  const decision = await resolveProductionSoraActorCurrent(
    { async readActorMetadata() { return [row(933, { created_by: "SORA_08" })]; } },
    7, NOW, HOUR,
  );
  assert.deepEqual(decision, { status: "HOLD", reason: "INVALID_SURFACE_RECORD" });
});

test("backend failure is not reported as no canonical", async () => {
  const decision = await resolveProductionSoraActorCurrent(
    { async readActorMetadata() { throw new Error("blocked"); } },
    7, NOW, HOUR,
  );
  assert.deepEqual(decision, { status: "HOLD", reason: "BACKEND_FAILURE" });
});

test("stale Production metadata remains HOLD", async () => {
  const decision = await resolveProductionSoraActorCurrent(
    { async readActorMetadata() {
      return [row(850, { created_at: "2026-09-27T17:39:04Z" })];
    } },
    7, NOW, HOUR,
  );
  assert.equal(decision.status, "HOLD");
  assert.equal(decision.reason, "STALE_CANONICAL");
});

test("malformed Production metadata fails at integration boundary", async () => {
  const decision = await resolveProductionSoraActorCurrent(
    { async readActorMetadata() { return [row(933, { conflict_flag: "false" })]; } },
    7, NOW, HOUR,
  );
  assert.deepEqual(decision, { status: "HOLD", reason: "INVALID_SURFACE_RECORD" });
});

test("invalid room fails closed without reading Production", async () => {
  let called = false;
  const decision = await resolveProductionSoraActorCurrent(
    { async readActorMetadata() { called = true; return []; } },
    0, NOW, HOUR,
  );
  assert.equal(called, false);
  assert.deepEqual(decision, { status: "HOLD", reason: "INVALID_SURFACE_RECORD" });
});
