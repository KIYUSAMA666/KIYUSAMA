import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateAndHandleRequest, signRequest } from '../../dist/security/index.js';

const secret = 'receiver-order-secret';
const now = 2_000_000_000;
const timestamp = String(now);
const body = { delivery_event_id: 'delivery-order-1', message: 'hello' };
const rawBody = JSON.stringify(body);

function dependencies(trace, persisted) {
  return {
    trace: (step) => trace.push(step),
    validateContract: (value) => {
      trace.push('contract-validator-called');
      return typeof value === 'object' && value !== null
        && value.delivery_event_id === 'delivery-order-1'
        && value.message === 'hello';
    },
    persistInbox: async (value) => {
      trace.push('inbox-side-effect');
      persisted.push(value);
    },
  };
}

test('S3-INTEGRATION-01 — successful receiver follows locked authentication order', async () => {
  const signatureHex = await signRequest(secret, timestamp, rawBody);
  const trace = [];
  const persisted = [];
  const accepted = await authenticateAndHandleRequest(secret, {
    rawBody,
    signatureHex,
    timestamp,
    headerDeliveryEventId: 'delivery-order-1',
  }, dependencies(trace, persisted), now);

  console.log('S3_RECEIVER_SUCCESS_EVIDENCE', JSON.stringify({ accepted, trace, persistedCount: persisted.length }));
  assert.equal(accepted, true);
  assert.deepEqual(trace, [
    'capture-raw-body',
    'read-signature',
    'read-timestamp',
    'verify-timestamp',
    'verify-hmac',
    'parse-json',
    'validate-contract',
    'contract-validator-called',
    'verify-delivery-event-id-binding',
    'persist-inbox',
    'inbox-side-effect',
  ]);
  assert.equal(persisted.length, 1);
});

test('S3-INTEGRATION-02 — bad timestamp stops before HMAC, parse, contract and inbox side effect', async () => {
  const signatureHex = await signRequest(secret, timestamp, rawBody);
  const trace = [];
  const persisted = [];
  const accepted = await authenticateAndHandleRequest(secret, {
    rawBody,
    signatureHex,
    timestamp: String(now + 301),
    headerDeliveryEventId: 'delivery-order-1',
  }, dependencies(trace, persisted), now);

  console.log('S3_RECEIVER_BAD_TIMESTAMP_EVIDENCE', JSON.stringify({ accepted, trace, persistedCount: persisted.length }));
  assert.equal(accepted, false);
  assert.deepEqual(trace, ['capture-raw-body','read-signature','read-timestamp','verify-timestamp']);
  assert.equal(persisted.length, 0);
});

test('S3-INTEGRATION-03 — bad HMAC stops before JSON parse, contract and inbox side effect', async () => {
  const signatureHex = await signRequest(secret, timestamp, rawBody);
  const tampered = `${signatureHex.slice(0, -2)}${signatureHex.slice(-2) === '00' ? '01' : '00'}`;
  const trace = [];
  const persisted = [];
  const accepted = await authenticateAndHandleRequest(secret, {
    rawBody,
    signatureHex: tampered,
    timestamp,
    headerDeliveryEventId: 'delivery-order-1',
  }, dependencies(trace, persisted), now);

  console.log('S3_RECEIVER_BAD_HMAC_EVIDENCE', JSON.stringify({ accepted, trace, persistedCount: persisted.length }));
  assert.equal(accepted, false);
  assert.deepEqual(trace, ['capture-raw-body','read-signature','read-timestamp','verify-timestamp','verify-hmac']);
  assert.equal(persisted.length, 0);
});

test('S3-INTEGRATION-04 — invalid JSON is parsed only after authentication and causes no inbox side effect', async () => {
  const invalidRawBody = '{"delivery_event_id":"delivery-order-1",';
  const signatureHex = await signRequest(secret, timestamp, invalidRawBody);
  const trace = [];
  const persisted = [];
  const accepted = await authenticateAndHandleRequest(secret, {
    rawBody: invalidRawBody,
    signatureHex,
    timestamp,
    headerDeliveryEventId: 'delivery-order-1',
  }, dependencies(trace, persisted), now);

  console.log('S3_RECEIVER_BAD_JSON_EVIDENCE', JSON.stringify({ accepted, trace, persistedCount: persisted.length }));
  assert.equal(accepted, false);
  assert.deepEqual(trace, ['capture-raw-body','read-signature','read-timestamp','verify-timestamp','verify-hmac','parse-json']);
  assert.equal(persisted.length, 0);
});

test('S3-INTEGRATION-05 — contract failure stops before ID binding and inbox side effect', async () => {
  const invalidContractBody = JSON.stringify({ delivery_event_id: 'delivery-order-1', message: 123 });
  const signatureHex = await signRequest(secret, timestamp, invalidContractBody);
  const trace = [];
  const persisted = [];
  const accepted = await authenticateAndHandleRequest(secret, {
    rawBody: invalidContractBody,
    signatureHex,
    timestamp,
    headerDeliveryEventId: 'delivery-order-1',
  }, dependencies(trace, persisted), now);

  console.log('S3_RECEIVER_BAD_CONTRACT_EVIDENCE', JSON.stringify({ accepted, trace, persistedCount: persisted.length }));
  assert.equal(accepted, false);
  assert.equal(trace.includes('verify-delivery-event-id-binding'), false);
  assert.equal(persisted.length, 0);
});

test('S3-INTEGRATION-06 — ID binding failure stops before inbox side effect', async () => {
  const signatureHex = await signRequest(secret, timestamp, rawBody);
  const trace = [];
  const persisted = [];
  const accepted = await authenticateAndHandleRequest(secret, {
    rawBody,
    signatureHex,
    timestamp,
    headerDeliveryEventId: 'wrong-delivery-id',
  }, dependencies(trace, persisted), now);

  console.log('S3_RECEIVER_BAD_BINDING_EVIDENCE', JSON.stringify({ accepted, trace, persistedCount: persisted.length }));
  assert.equal(accepted, false);
  assert.equal(trace.at(-1), 'verify-delivery-event-id-binding');
  assert.equal(persisted.length, 0);
});
