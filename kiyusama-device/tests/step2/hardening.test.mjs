import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import {
  atomicAccept,
  dispatchOnce,
  reconcileStaleDispatch,
} from '../../src/step2-hardening.js';
import { SqliteD1Adapter } from './sqlite-d1-adapter.mjs';

const schema = readFileSync(new URL('../../migrations/0002_step2_hardening.sql', import.meta.url), 'utf8');
const database = () => new SqliteD1Adapter(schema);
const row = (db, sql, ...values) => db.prepare(sql).bind(...values).first();

test('TEST 6 — atomic accept commits claim and durable payload together', async (t) => {
  const db = database(); t.after(() => db.close());
  await atomicAccept(db, {
    delivery_event_id: 'delivery-6', device_event_id: 'device-6', hop: 1,
    payload_json: '{"durable":true}',
  }, 6000);
  const claim = await row(db, 'SELECT * FROM delivery_claims WHERE delivery_event_id = ?', 'delivery-6');
  const payload = await row(db, 'SELECT * FROM durable_payloads WHERE delivery_event_id = ?', 'delivery-6');
  console.log('TEST6_POST_STATE', JSON.stringify({ claim, payload }));
  assert.ok(claim); assert.equal(payload.payload_json, '{"durable":true}');
});

test('TEST 7 — payload failure and duplicate conflict never leave claim-only state', async (t) => {
  const db = database(); t.after(() => db.close());
  await assert.rejects(atomicAccept(db, {
    delivery_event_id: 'payload-fails', device_event_id: 'device-7', hop: 1, payload_json: '',
  }, 7000));
  const failedState = {
    claim: await row(db, 'SELECT * FROM delivery_claims WHERE delivery_event_id = ?', 'payload-fails'),
    payload: await row(db, 'SELECT * FROM durable_payloads WHERE delivery_event_id = ?', 'payload-fails'),
  };
  await atomicAccept(db, {
    delivery_event_id: 'valid-7', device_event_id: 'device-7', hop: 2, payload_json: '{"original":true}',
  }, 7001);
  await assert.rejects(atomicAccept(db, {
    delivery_event_id: 'valid-7', device_event_id: 'attacker', hop: 99, payload_json: '{"corrupt":true}',
  }, 7002));
  const validState = {
    claim: await row(db, 'SELECT * FROM delivery_claims WHERE delivery_event_id = ?', 'valid-7'),
    payload: await row(db, 'SELECT * FROM durable_payloads WHERE delivery_event_id = ?', 'valid-7'),
  };
  console.log('TEST7_POST_FAILURE_DB_STATE', JSON.stringify({ failedState, validState }));
  assert.deepEqual(failedState, { claim: null, payload: null });
  assert.equal(validState.claim.device_event_id, 'device-7');
  assert.equal(validState.payload.payload_json, '{"original":true}');
});

test('TEST 8 — independent connections race for one dispatch claim', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'kiyusama-test8-'));
  const databasePath = join(directory, 'race.sqlite');
  const setup = new SqliteD1Adapter(schema, databasePath); setup.close();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const startGate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const providerCounter = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const gate = new Int32Array(startGate);
  const contenders = Array.from({ length: 16 }, (_, contender) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./dispatch-contender.mjs', import.meta.url), {
      workerData: { contender, databasePath, startGate, providerCalls: providerCounter },
    });
    worker.once('message', resolve); worker.once('error', reject);
  }));
  while (Atomics.load(gate, 0) !== 16) await new Promise((resolve) => setImmediate(resolve));
  Atomics.store(gate, 1, 1); Atomics.notify(gate, 1, 16);
  const attempts = await Promise.all(contenders);
  const winners = attempts.filter((attempt) => attempt.winner).length;
  const providerCalls = Atomics.load(new Int32Array(providerCounter), 0);
  const db = new SqliteD1Adapter('', databasePath); t.after(() => db.close());
  const state = await row(db, 'SELECT * FROM dispatches WHERE device_event_id = ? AND hop = ?', 'device-8', 1);
  console.log('TEST8_RACE_EVIDENCE', JSON.stringify({ executionContexts: attempts, contenders: 16, winners, losers: 16 - winners, providerCalls, state }));
  assert.equal(attempts.filter((attempt) => attempt.error).length, 0);
  assert.equal(winners, 1); assert.equal(providerCalls, 1); assert.equal(state.state, 'DISPATCHED');
});

test('TEST 9A — crash before POST waits for timeout then safely reconciles', async (t) => {
  const db = database(); t.after(() => db.close());
  let providerCalls = 0; let reconcileCalls = 0;
  await assert.rejects(dispatchOnce({
    db, deviceEventId: 'device-9a', hop: 1, nowMs: 9000,
    providerPost: async () => { providerCalls += 1; return {}; }, crashAfterClaim: true,
  }), /INJECTED_CRASH/);
  const early = await reconcileStaleDispatch({
    db, deviceEventId: 'device-9a', hop: 1, nowMs: 9999, dispatchTimeoutMs: 1000,
    proveOutcome: async () => { reconcileCalls += 1; return null; },
  });
  const beforeTimeout = await row(db, 'SELECT * FROM dispatches WHERE device_event_id = ?', 'device-9a');
  const recovered = await reconcileStaleDispatch({
    db, deviceEventId: 'device-9a', hop: 1, nowMs: 10000, dispatchTimeoutMs: 1000,
    proveOutcome: async () => { reconcileCalls += 1; return null; },
  });
  const finalState = await row(db, 'SELECT * FROM dispatches WHERE device_event_id = ?', 'device-9a');
  console.log('TEST9A_POST_FAILURE_DB_STATE', JSON.stringify({ providerCalls, reconcileCalls, early, beforeTimeout, recovered, finalState }));
  assert.equal(providerCalls, 0); assert.equal(reconcileCalls, 1);
  assert.equal(early.reconciler, false); assert.equal(beforeTimeout.state, 'DISPATCHING');
  assert.equal(finalState.state, 'UNKNOWN_DISPATCH');
});

test('TEST 9B — crash after POST forbids blind redispatch and becomes UNKNOWN_DISPATCH', async (t) => {
  const db = database(); t.after(() => db.close());
  let providerCalls = 0;
  const providerPost = async () => { providerCalls += 1; return { session_id: 'orphaned-session' }; };
  await assert.rejects(dispatchOnce({
    db, deviceEventId: 'device-9b', hop: 1, nowMs: 11000, providerPost, crashAfterPost: true,
  }), /INJECTED_CRASH/);
  const retry = await dispatchOnce({ db, deviceEventId: 'device-9b', hop: 1, nowMs: 13000, providerPost });
  const recovered = await reconcileStaleDispatch({
    db, deviceEventId: 'device-9b', hop: 1, nowMs: 13000, dispatchTimeoutMs: 2000,
    proveOutcome: async () => null,
  });
  const finalState = await row(db, 'SELECT * FROM dispatches WHERE device_event_id = ?', 'device-9b');
  console.log('TEST9B_POST_FAILURE_DB_STATE', JSON.stringify({ providerCalls, retry, recovered, finalState }));
  assert.equal(providerCalls, 1); assert.equal(retry.winner, false);
  assert.equal(recovered.state, 'UNKNOWN_DISPATCH'); assert.equal(finalState.provider_session_id, null);
});

test('TEST 9C — timeout-crossing reconciliation wins authority over late healthy completion', async (t) => {
  const db = database(); t.after(() => db.close());
  let providerCalls = 0; let resolveProvider;
  const response = new Promise((resolve) => { resolveProvider = resolve; });
  const active = dispatchOnce({
    db, deviceEventId: 'device-9c', hop: 1, nowMs: 14000,
    providerPost: async () => { providerCalls += 1; return response; },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const raceLog = ['provider-outstanding', 'timeout-crossed'];
  const reconciliation = reconcileStaleDispatch({
    db, deviceEventId: 'device-9c', hop: 1, nowMs: 14010, dispatchTimeoutMs: 10,
    proveOutcome: async () => {
      raceLog.push('reconciler-acquired');
      return { session_id: 'healthy-session', run_id: 'healthy-run' };
    },
  });
  const duplicate = await dispatchOnce({
    db, deviceEventId: 'device-9c', hop: 1, nowMs: 14010,
    providerPost: async () => { providerCalls += 1; return {}; },
  });
  resolveProvider({ session_id: 'healthy-session' });
  const [recovered, activeResult] = await Promise.all([
    reconciliation,
    active.then(() => 'original-completed', (error) => { raceLog.push(error.message); return error.message; }),
  ]);
  const finalState = await row(db, 'SELECT * FROM dispatches WHERE device_event_id = ?', 'device-9c');
  console.log('TEST9C_TIMEOUT_RACE_EVIDENCE', JSON.stringify({ dispatchTimeoutMs: 10, providerCalls, duplicate, recovered, activeResult, raceLog, finalState }));
  assert.equal(duplicate.winner, false); assert.equal(providerCalls, 1);
  assert.equal(recovered.reconciler, true); assert.equal(activeResult, 'DISPATCH_CLAIM_LOST_BEFORE_OUTCOME_PERSIST');
  assert.equal(finalState.state, 'DISPATCHED'); assert.equal(finalState.provider_session_id, 'healthy-session');
});

test('TEST 10 — capture actual node:sqlite UNIQUE error shape', async (t) => {
  const db = database(); t.after(() => db.close());
  await db.prepare(`INSERT INTO dispatches
    (device_event_id, hop, state, claimed_at_ms, updated_at_ms)
    VALUES (?, ?, 'DISPATCHING', ?, ?)`
  ).bind('device-10', 1, 16000, 16000).run();
  let captured;
  try {
    await db.prepare(`INSERT INTO dispatches
      (device_event_id, hop, state, claimed_at_ms, updated_at_ms)
      VALUES (?, ?, 'DISPATCHING', ?, ?)`
    ).bind('device-10', 1, 16001, 16001).run();
  } catch (error) {
    captured = {
      constructor: error.constructor?.name, name: error.name, message: error.message,
      string: String(error), code: error.code, errcode: error.errcode,
      errstr: error.errstr, cause: error.cause ?? null,
    };
  }
  console.log('TEST10_RUNTIME', JSON.stringify({ runtime: 'plain node:sqlite (NOT real D1 or Miniflare)', node: process.version, sqlite: db.sqlite.prepare('SELECT sqlite_version() AS version').get().version }));
  console.log('TEST10_UNIQUE_ERROR_SHAPE', JSON.stringify(captured));
  assert.ok(captured); assert.match(captured.message, /UNIQUE constraint failed/);
});
