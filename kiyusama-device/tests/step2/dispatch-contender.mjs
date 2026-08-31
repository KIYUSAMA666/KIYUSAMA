import { parentPort, threadId, workerData } from 'node:worker_threads';
import { dispatchOnce } from '../../src/step2-hardening.js';
import { SqliteD1Adapter } from './sqlite-d1-adapter.mjs';

const { contender, databasePath, startGate, providerCalls } = workerData;
const gate = new Int32Array(startGate);
const calls = new Int32Array(providerCalls);
const db = new SqliteD1Adapter('', databasePath);

Atomics.add(gate, 0, 1);
Atomics.wait(gate, 1, 0);

try {
  const result = await dispatchOnce({
    db,
    deviceEventId: 'device-8',
    hop: 1,
    nowMs: 8000,
    providerPost: async () => {
      Atomics.add(calls, 0, 1);
      return { session_id: 'session-8', run_id: 'run-8' };
    },
  });
  parentPort.postMessage({ contender, threadId, ...result });
} catch (error) {
  parentPort.postMessage({ contender, threadId, error: String(error) });
} finally {
  db.close();
}
