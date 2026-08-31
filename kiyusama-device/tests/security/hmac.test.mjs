import assert from 'node:assert/strict';
import test from 'node:test';
import {
  signRequest,
  verifySignature,
  verifyTimestamp,
  verifyDeliveryEventIdBinding,
} from '../../dist/security/index.js';

const secret = 'step3-test-secret';
const timestamp = '1760000000';
const rawBody = '{"delivery_event_id":"delivery-123","message":"hello"}';

async function manualHmacHex(secretValue, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secretValue), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

test('S3-01 — valid request accepted and exact timestamp-dot-rawBody message proven', async () => {
  const signature = await signRequest(secret, timestamp, rawBody);
  const expectedDot = await manualHmacHex(secret, `${timestamp}.${rawBody}`);
  const wrongColon = await manualHmacHex(secret, `${timestamp}:${rawBody}`);
  const verified = await verifySignature(secret, timestamp, rawBody, signature);
  const evidence = {
    verified,
    signatureLength: signature.length,
    equalsManualTimestampDotRawBody: signature === expectedDot,
    differsFromTimestampColonRawBody: signature !== wrongColon,
  };
  console.log('S3_01_EVIDENCE', JSON.stringify(evidence));
  assert.equal(verified, true);
  assert.equal(signature.length, 64);
  assert.equal(evidence.equalsManualTimestampDotRawBody, true);
  assert.equal(evidence.differsFromTimestampColonRawBody, true);
});

test('S3-02 — wrong secret and one-byte signature tamper rejected', async () => {
  const signature = await signRequest(secret, timestamp, rawBody);
  const wrongSecret = await verifySignature('wrong-secret', timestamp, rawBody, signature);
  const lastByte = signature.slice(-2);
  const tamperedByte = lastByte === '00' ? '01' : '00';
  const tamperedSignature = `${signature.slice(0, -2)}${tamperedByte}`;
  const tampered = await verifySignature(secret, timestamp, rawBody, tamperedSignature);
  console.log('S3_02_EVIDENCE', JSON.stringify({ wrongSecret, tampered, changedBytes: 1 }));
  assert.equal(wrongSecret, false);
  assert.equal(tampered, false);
});

test('S3-03 — raw body one-character tamper rejected', async () => {
  const signature = await signRequest(secret, timestamp, rawBody);
  const tamperedBody = rawBody.replace('hello', 'jello');
  const verified = await verifySignature(secret, timestamp, tamperedBody, signature);
  console.log('S3_03_EVIDENCE', JSON.stringify({ verified, originalBody: rawBody, tamperedBody }));
  assert.equal(verified, false);
});

test('S3-04 — timestamp boundary and malformed timestamp inputs', () => {
  const now = 2_000_000_000;
  const observations = {
    minus300: verifyTimestamp(String(now - 300), now),
    plus300: verifyTimestamp(String(now + 300), now),
    minus301: verifyTimestamp(String(now - 301), now),
    plus301: verifyTimestamp(String(now + 301), now),
    milliseconds: verifyTimestamp(String(now * 1000), now),
    fractional: verifyTimestamp(`${now}.5`, now),
    empty: verifyTimestamp('', now),
    nonnumeric: verifyTimestamp('not-a-number', now),
    nanLike: verifyTimestamp('NaN', now),
  };
  console.log('S3_04_EVIDENCE', JSON.stringify({ now, observations }));
  assert.equal(observations.minus300, true);
  assert.equal(observations.plus300, true);
  assert.equal(observations.minus301, false);
  assert.equal(observations.plus301, false);
  assert.equal(observations.milliseconds, false);
  assert.equal(observations.fractional, false);
  assert.equal(observations.empty, false);
  assert.equal(observations.nonnumeric, false);
  assert.equal(observations.nanLike, false);
});

test('S3-05 — delivery_event_id binding requires exact match', () => {
  const observations = {
    exact: verifyDeliveryEventIdBinding('Delivery-ABC', 'Delivery-ABC'),
    caseMismatch: verifyDeliveryEventIdBinding('Delivery-ABC', 'delivery-abc'),
    whitespaceMismatch: verifyDeliveryEventIdBinding('Delivery-ABC ', 'Delivery-ABC'),
    unicodeMismatch: verifyDeliveryEventIdBinding('é', 'é'),
    missingHeader: verifyDeliveryEventIdBinding(null, 'Delivery-ABC'),
    missingBody: verifyDeliveryEventIdBinding('Delivery-ABC', undefined),
  };
  console.log('S3_05_EVIDENCE', JSON.stringify(observations));
  assert.equal(observations.exact, true);
  assert.equal(observations.caseMismatch, false);
  assert.equal(observations.whitespaceMismatch, false);
  assert.equal(observations.unicodeMismatch, false);
  assert.equal(observations.missingHeader, false);
  assert.equal(observations.missingBody, false);
});

test('S3-06 — malformed signatures fail closed without exception', async () => {
  const malformed = {
    oddLength: 'abc',
    nonHex: 'zz',
    empty: '',
    nullChar: `aa\u0000bb`,
    validHexWrongByteLength: '00',
  };
  const results = {};
  for (const [name, value] of Object.entries(malformed)) {
    let threw = false;
    let verified;
    try {
      verified = await verifySignature(secret, timestamp, rawBody, value);
    } catch {
      threw = true;
    }
    results[name] = { verified, threw, hexLength: value.length };
  }
  console.log('S3_06_EVIDENCE', JSON.stringify(results));
  for (const result of Object.values(results)) {
    assert.equal(result.threw, false);
    assert.equal(result.verified, false);
  }
});
