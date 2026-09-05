import { TontonError } from './tonton-core.js';
import { createExistingRunnerAdapter } from './tonton-existing-runner-adapter.js';
import { createExistingRunnerSeam } from './tonton-existing-runner-seam.js';
import { createCodexExecutorContract } from './tonton-codex-executor-contract.js';

const REQUIRED_ENVELOPE_KEYS = [
  'event_id',
  'source',
  'target',
  'payload_ref',
  'authority',
  'trace_id',
  'dedupe_key',
  'occurred_at',
  'ttl',
];

function requireNonEmpty(value, code, message) {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new TontonError(code, message);
  }
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw new TontonError('TONTON_CODEX_WRAPPER_INVALID_ENVELOPE', 'DeliveryEnvelope is required');
  }

  for (const key of REQUIRED_ENVELOPE_KEYS) {
    if (!(key in envelope)) {
      throw new TontonError(
        'TONTON_CODEX_WRAPPER_INVALID_ENVELOPE',
        `DeliveryEnvelope.${key} is required`,
      );
    }
  }

  requireNonEmpty(envelope.event_id, 'TONTON_CODEX_WRAPPER_INVALID_ENVELOPE', 'event_id is required');
  requireNonEmpty(envelope.source, 'TONTON_CODEX_WRAPPER_INVALID_ENVELOPE', 'source is required');
  requireNonEmpty(envelope.target, 'TONTON_CODEX_WRAPPER_INVALID_ENVELOPE', 'target is required');
  requireNonEmpty(envelope.payload_ref, 'TONTON_CODEX_WRAPPER_INVALID_ENVELOPE', 'payload_ref is required');
  requireNonEmpty(envelope.trace_id, 'TONTON_CODEX_WRAPPER_INVALID_ENVELOPE', 'trace_id is required');
  requireNonEmpty(envelope.dedupe_key, 'TONTON_CODEX_WRAPPER_INVALID_ENVELOPE', 'dedupe_key is required');
  requireNonEmpty(envelope.occurred_at, 'TONTON_CODEX_WRAPPER_INVALID_ENVELOPE', 'occurred_at is required');

  if (!Number.isFinite(envelope.ttl) || envelope.ttl <= 0) {
    throw new TontonError('TONTON_CODEX_WRAPPER_INVALID_ENVELOPE', 'ttl must be a positive number');
  }
}

function addMs(timestamp, ttl) {
  const base = Date.parse(timestamp);
  if (!Number.isFinite(base)) {
    throw new TontonError('TONTON_CODEX_WRAPPER_INVALID_ENVELOPE', 'occurred_at must be RFC3339-compatible');
  }
  return new Date(base + ttl).toISOString();
}

/**
 * Compatibility boundary between frozen TONTON Contract-facing delivery input
 * and the historical Codex runner shape.
 *
 * WATCH / WAKE / ROUTE stay upstream.
 * DELIVER is translated into legacy claim -> execute -> record responsibilities.
 * ACK compatibility output is produced after the legacy record step succeeds.
 * VERIFY is deliberately NOT performed here. The executor/wrapper can never
 * self-promote a result to VERIFIED; independent verification remains external.
 */
export function createLegacyCodexAdapterWrapper({
  claimTask,
  executeCodex,
  recordResult,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof claimTask !== 'function') {
    throw new TontonError('TONTON_CODEX_WRAPPER_CONFIG_ERROR', 'claimTask is required');
  }
  if (typeof executeCodex !== 'function') {
    throw new TontonError('TONTON_CODEX_WRAPPER_CONFIG_ERROR', 'executeCodex is required');
  }
  if (typeof recordResult !== 'function') {
    throw new TontonError('TONTON_CODEX_WRAPPER_CONFIG_ERROR', 'recordResult is required');
  }
  if (typeof now !== 'function') {
    throw new TontonError('TONTON_CODEX_WRAPPER_CONFIG_ERROR', 'now must be a function');
  }

  const executeTask = createCodexExecutorContract({ executeCodex });
  const adapter = createExistingRunnerAdapter({ claimTask, executeTask, recordResult });
  const runLegacy = createExistingRunnerSeam(adapter);

  return async function runLegacyCodexAdapter({
    envelope,
    route_id,
    delivery_attempt_id,
    adapter_id = 'legacy-codex',
    hint = null,
  } = {}) {
    validateEnvelope(envelope);
    requireNonEmpty(route_id, 'TONTON_CODEX_WRAPPER_INVALID_REQUEST', 'route_id is required');
    requireNonEmpty(
      delivery_attempt_id,
      'TONTON_CODEX_WRAPPER_INVALID_REQUEST',
      'delivery_attempt_id is required',
    );
    requireNonEmpty(adapter_id, 'TONTON_CODEX_WRAPPER_INVALID_REQUEST', 'adapter_id is required');

    const result = await runLegacy({
      kind: 'OS_RUNNER_REQUEST',
      signalId: String(envelope.event_id),
      source: envelope.source,
      dedupeKey: envelope.dedupe_key,
      hint: {
        payload_ref: envelope.payload_ref,
        target: envelope.target,
        authority: envelope.authority,
        trace_id: envelope.trace_id,
        route_id,
        delivery_attempt_id,
        adapter_id,
        occurred_at: envelope.occurred_at,
        ttl: envelope.ttl,
        legacy_hint: hint,
      },
    });

    const completedAt = now();

    if (!result.accepted) {
      return {
        accepted: false,
        stage: result.stage,
        adapter_result: {
          event_id: envelope.event_id,
          trace_id: envelope.trace_id,
          delivery_attempt_id,
          adapter_id,
          delivery_status: 'DELIVERY_FAILED',
          ack_ref: null,
          error_code: `LEGACY_CODEX_${String(result.stage).toUpperCase()}_REJECTED`,
          evidence_ref: null,
          completed_at: completedAt,
        },
        verification: {
          status: 'PENDING_EXTERNAL',
          final_verified: false,
          executor_may_final_verify: false,
        },
      };
    }

    const legacyStatus = result.execution?.status ?? 'COMPLETE';
    if (legacyStatus === 'VERIFIED') {
      throw new TontonError(
        'TONTON_CODEX_SELF_VERIFY_FORBIDDEN',
        'Legacy Codex executor cannot emit final VERIFIED',
      );
    }

    const ackRef =
      result.recorded?.receipt ??
      result.execution?.legacyExecution?.executorEvidence?.ref ??
      `legacy-codex:${result.task?.taskId ?? envelope.event_id}`;

    return {
      accepted: true,
      stage: 'complete',
      adapter_result: {
        event_id: envelope.event_id,
        trace_id: envelope.trace_id,
        delivery_attempt_id,
        adapter_id,
        delivery_status: 'ACKNOWLEDGED',
        ack_ref: String(ackRef),
        error_code: null,
        evidence_ref: result.execution?.legacyExecution?.executorEvidence ?? null,
        completed_at: completedAt,
      },
      ack_receipt: {
        ack_id: `ack:${delivery_attempt_id}`,
        event_id: envelope.event_id,
        trace_id: envelope.trace_id,
        route_id,
        delivery_attempt_id,
        adapter_id,
        ack_status: 'ACKNOWLEDGED',
        ack_code: 'LEGACY_CODEX_ACCEPTED',
        ack_ref: String(ackRef),
        occurred_at: completedAt,
        expires_at: addMs(envelope.occurred_at, envelope.ttl),
      },
      record_candidate: {
        event_id: envelope.event_id,
        trace_id: envelope.trace_id,
        stage: 'LEGACY_CODEX_ADAPTER',
        actor: adapter_id,
        result: legacyStatus,
        timestamp: completedAt,
        authority_ref: envelope.authority,
        source_evidence_ref: result.execution?.legacyExecution?.executorEvidence ?? null,
        sanitized: true,
        persisted_by_legacy_sink: true,
        legacy_receipt: result.recorded?.receipt ?? null,
      },
      verification: {
        status: 'PENDING_EXTERNAL',
        final_verified: false,
        executor_may_final_verify: false,
      },
      legacy: result,
    };
  };
}
