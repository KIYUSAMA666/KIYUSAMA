import assert from "node:assert/strict";
import { Miniflare } from "miniflare";

const mf = new Miniflare({
  modules: true,
  script: `export default { async fetch() { return new Response("ok"); } };`,
  d1Databases: { DB: "kiyusama-step2-test10" },
});

try {
  const db = await mf.getD1Database("DB");

  await db.exec(`
    DROP TABLE IF EXISTS dispatch_claims;
    CREATE TABLE dispatch_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_event_id TEXT NOT NULL,
      hop INTEGER NOT NULL,
      payload TEXT,
      UNIQUE(device_event_id, hop)
    );
  `);

  const key = ["evt-test10-d1", 3];
  await db.prepare(
    "INSERT INTO dispatch_claims (device_event_id, hop, payload) VALUES (?, ?, ?)"
  ).bind(key[0], key[1], "first").run();

  let captured = null;
  try {
    await db.prepare(
      "INSERT INTO dispatch_claims (device_event_id, hop, payload) VALUES (?, ?, ?)"
    ).bind(key[0], key[1], "duplicate").run();
  } catch (error) {
    captured = {
      constructorName: error?.constructor?.name ?? null,
      name: error?.name ?? null,
      message: error?.message ?? null,
      string: String(error),
      cause: error?.cause == null ? null : String(error.cause),
      stackFirstLine: typeof error?.stack === "string" ? error.stack.split("\n")[0] : null,
    };
    console.log("TEST10_D1_ERROR_SHAPE=" + JSON.stringify(captured));
  }

  assert.ok(captured, "expected D1-compatible UNIQUE violation to throw");

  const state = await db.prepare(
    "SELECT id, device_event_id, hop, payload FROM dispatch_claims WHERE device_event_id = ? AND hop = ? ORDER BY id"
  ).bind(key[0], key[1]).all();

  console.log("TEST10_D1_FINAL_STATE=" + JSON.stringify(state.results));
  assert.equal(state.results.length, 1, "duplicate failure must not create a second row");
  assert.equal(state.results[0].payload, "first", "original valid row must remain unchanged");

  console.log("TEST10_RUNTIME=" + JSON.stringify({
    node: process.version,
    runtime: "Miniflare / workerd D1 binding",
    d1Binding: "DB",
  }));
  console.log("TEST10_RESULT=PASS");
} finally {
  await mf.dispose();
}
