import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegacyCodexAdapterWrapper } from '../../src/legacy-codex-adapter-wrapper.js';

const envelope = {
  event_id: 'evt-001',
  source: 'tonton-route',
  target: 'codex',
  payload_ref: 'payload://task-001',
  authority: { authority_id: 'kiyusama' },
  trace_id: 'trace-001',
  dedupe_key: 'dedupe-001',
  occurred_at: '2026-09-06T00:00:00.000Z',
  ttl: 60_000,
};

function makeWrapper(overrides = {}) {
  const calls = { claim: [], execute: [], record: [] };

  const wrapper = createLegacyCodexAdapterWrapper({
    claimTask: async (input) => {
      calls.claim.push(input);
      return {
        accepted: true,
        taskId: 'task-001',
        content: 'Implement adapter safely',
        baseBranch: 'base-branch',
        baseSha: 'base-sha',
      };
    },
    executeCodex: async (input) => {
      calls.execute.push(input);
      return {
        accepted: true,
        status: 'COMPLETE',
        branch: 'codex/work-001',
        summary: 'done',
        evidence: { ref: 'exec-proof-001' },
      };
    },
    recordResult: async (input) => {
      calls.record.push(input);
      return { accepted: true, receipt: 'record-proof-001' };
    },
    now: () => '2026-09-06T00:00:10.000Z',
    ...overrides,
  });

  return { wrapper, calls };
}

test('maps frozen DeliveryEnvelope-facing input into legacy Codex runner and back', async () => {
  const { wrapper, calls } = makeWrapper();

  const result = await wrapper({
    envelope,
    route_id: 'route-001',
    delivery_attempt_id: 'attempt-001',
    adapter_id: 'legacy-codex',
    hint: { priority: 'normal' },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.adapter_result.delivery_status, 'ACKNOWLEDGED');
  assert.equal(result.adapter_result.event_id, envelope.event_id);
  assert.equal(result.adapter_result.trace_id, envelope.trace_id);
  assert.equal(result.adapter_result.delivery_attempt_id, 'attempt-001');
  assert.equal(result.adapter_result.adapter_id, 'legacy-codex');
  assert.equal(result.adapter_result.ack_ref, 'record-proof-001');
  assert.deepEqual(result.adapter_result.evidence_ref, { ref: 'exec-proof-001' });

  assert.equal(result.ack_receipt.route_id, 'route-001');
  assert.equal(result.ack_receipt.ack_status, 'ACKNOWLEDGED');
  assert.equal(result.ack_receipt.expires_at, '2026-09-06T00:01:00.000Z');

  assert.equal(result.record_candidate.persisted_by_legacy_sink, true);
  assert.equal(result.record_candidate.legacy_receipt, 'record-proof-001');
  assert.equal(result.verification.status, 'PENDING_EXTERNAL');
  assert.equal(result.verification.final_verified, false);
  assert.equal(result.verification.executor_may_final_verify, false);

  assert.equal(calls.claim.length, 1);
  assert.equal(calls.claim[0].dedupeKey, envelope.dedupe_key);
  assert.equal(calls.claim[0].hint.payload_ref, envelope.payload_ref);
  assert.equal(calls.claim[0].hint.route_id, 'route-001');

  assert.equal(calls.execute.length, 1);
  assert.deepEqual(calls.execute[0].guard, {
    protectedPaths: ['.github', '.codex'],
    approvalPolicy: 'never',
    sandboxMode: 'workspace-write',
  });

  assert.equal(calls.record.length, 1);
  assert.equal(calls.record[0].taskId, 'task-001');
  assert.equal(calls.record[0].status, 'COMPLETE');
});

test('never invokes executor or record sink when legacy claim rejects', async () => {
  let executeCalls = 0;
  let recordCalls = 0;

  const { wrapper } = makeWrapper({
    claimTask: async () => ({ accepted: false }),
    executeCodex: async () => {
      executeCalls += 1;
      return { accepted: true };
    },
    recordResult: async () => {
      recordCalls += 1;
      return { accepted: true };
    },
  });

  const result = await wrapper({
    envelope,
    route_id: 'route-001',
    delivery_attempt_id: 'attempt-002',
  });

  assert.equal(result.accepted, false);
  assert.equal(result.stage, 'task_source');
  assert.equal(result.adapter_result.delivery_status, 'DELIVERY_FAILED');
  assert.equal(result.verification.status, 'PENDING_EXTERNAL');
  assert.equal(executeCalls, 0);
  assert.equal(recordCalls, 0);
});

test('rejects any attempt by legacy Codex executor to self-issue VERIFIED', async () => {
  const { wrapper } = makeWrapper({
    executeCodex: async () => ({
      accepted: true,
      status: 'VERIFIED',
      evidence: { ref: 'self-verify-attempt' },
    }),
  });

  await assert.rejects(
    wrapper({
      envelope,
      route_id: 'route-001',
      delivery_attempt_id: 'attempt-003',
    }),
    (error) => error?.code === 'TONTON_CODEX_SELF_VERIFY_FORBIDDEN',
  );
});

test('enforces ttl from the frozen DeliveryEnvelope contract', async () => {
  const { wrapper } = makeWrapper();

  await assert.rejects(
    wrapper({
      envelope: { ...envelope, ttl: 0 },
      route_id: 'route-001',
      delivery_attempt_id: 'attempt-004',
    }),
    (error) => error?.code === 'TONTON_CODEX_WRAPPER_INVALID_ENVELOPE',
  );
});

test('requires route and delivery-attempt correlation ids', async () => {
  const { wrapper } = makeWrapper();

  await assert.rejects(
    wrapper({ envelope, delivery_attempt_id: 'attempt-005' }),
    (error) => error?.code === 'TONTON_CODEX_WRAPPER_INVALID_REQUEST',
  );

  await assert.rejects(
    wrapper({ envelope, route_id: 'route-001' }),
    (error) => error?.code === 'TONTON_CODEX_WRAPPER_INVALID_REQUEST',
  );
});
