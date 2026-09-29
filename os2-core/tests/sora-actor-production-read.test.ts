import test from "node:test";
import assert from "node:assert/strict";
import {
  mapProductionKnowledgeRows,
  resolveProductionSoraActorExperience,
} from "../src/sora-actor-production-read.js";

const NOW = Date.parse("2026-09-30T05:00:00Z");

test("maps existing Production knowledge metadata without inventing actor identity", () => {
  const [row] = mapProductionKnowledgeRows([{
    id: 850,
    created_by: "SORA_07",
    created_at: "2026-09-30T04:59:00Z",
    status: "ACTIVE",
    conflict_flag: false,
    subject_key: "sora07.example",
  }]);
  assert.equal(row?.createdBy, "SORA_07");
  assert.equal(row?.id, 850);
  assert.equal(row?.subjectKey, "sora07.example");
});

test("resolves only the requested exact room actor from Production rows", async () => {
  const decision = await resolveProductionSoraActorExperience({
    async readKnowledgeEntries() {
      return [
        { id: 851, created_by: "SORA_08", created_at: "2026-09-30T04:59:50Z", status: "ACTIVE", conflict_flag: false },
        { id: 850, created_by: "SORA_07", created_at: "2026-09-30T04:59:00Z", status: "ACTIVE", conflict_flag: false },
      ];
    },
  }, 7, NOW, 5 * 60_000);
  assert.equal(decision.status, "RESOLVED");
  if (decision.status === "RESOLVED") assert.equal(decision.record.createdBy, "SORA_07");
});

test("stale Production actor evidence holds", async () => {
  const decision = await resolveProductionSoraActorExperience({
    async readKnowledgeEntries() {
      return [{ id: 850, created_by: "SORA_07", created_at: "2026-09-29T17:39:04Z", status: "ACTIVE", conflict_flag: false }];
    },
  }, 7, NOW, 5 * 60_000);
  assert.deepEqual(decision.status, "HOLD");
  if (decision.status === "HOLD") assert.equal(decision.reason, "STALE_CANONICAL");
});

test("backend failure holds without fallback", async () => {
  const decision = await resolveProductionSoraActorExperience({
    async readKnowledgeEntries() { throw new Error("backend"); },
  }, 7, NOW, 5 * 60_000);
  assert.deepEqual(decision, { status: "HOLD", reason: "BACKEND_FAILURE" });
});

test("malformed required Production metadata is not repaired by the adapter", async () => {
  const decision = await resolveProductionSoraActorExperience({
    async readKnowledgeEntries() {
      return [{ id: "850", created_by: "SORA_07", created_at: "bad-time", status: "ACTIVE", conflict_flag: false }];
    },
  }, 7, NOW, 5 * 60_000);
  assert.equal(decision.status, "HOLD");
  if (decision.status === "HOLD") assert.equal(decision.reason, "INVALID_RECORD");
});
