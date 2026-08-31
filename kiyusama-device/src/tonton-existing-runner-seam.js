import { TontonError } from './tonton-core.js';

/**
 * Backend-neutral seam that mirrors the existing OS runner shape without binding
 * to COMMON MEMORY/Supabase or any concrete provider.
 *
 * Existing runner responsibilities are separated into:
 *   TaskSource -> Executor -> ResultSink
 *
 * All three are injected and therefore independently verifiable.
 */
export function createExistingRunnerSeam({ taskSource, executor, resultSink } = {}) {
  if (typeof taskSource !== 'function') {
    throw new TontonError('TONTON_RUNNER_SEAM_CONFIG_ERROR', 'taskSource is required');
  }
  if (typeof executor !== 'function') {
    throw new TontonError('TONTON_RUNNER_SEAM_CONFIG_ERROR', 'executor is required');
  }
  if (typeof resultSink !== 'function') {
    throw new TontonError('TONTON_RUNNER_SEAM_CONFIG_ERROR', 'resultSink is required');
  }

  return async function runExistingOsContract(request) {
    if (!request || request.kind !== 'OS_RUNNER_REQUEST') {
      throw new TontonError('TONTON_RUNNER_SEAM_INVALID_REQUEST', 'OS_RUNNER_REQUEST is required');
    }
    if (!request.signalId) {
      throw new TontonError('TONTON_RUNNER_SEAM_INVALID_REQUEST', 'signalId is required');
    }

    const task = await taskSource({
      signalId: String(request.signalId),
      source: request.source ?? 'unknown',
      dedupeKey: request.dedupeKey ?? null,
      hint: request.hint ?? null,
    });

    if (!task || task.accepted === false) {
      return { accepted: false, stage: 'task_source' };
    }

    const execution = await executor({
      signalId: String(request.signalId),
      task,
    });

    if (!execution || execution.accepted === false) {
      return { accepted: false, stage: 'executor' };
    }

    const recorded = await resultSink({
      signalId: String(request.signalId),
      task,
      execution,
    });

    if (!recorded || recorded.accepted === false) {
      return { accepted: false, stage: 'result_sink' };
    }

    return {
      accepted: true,
      stage: 'complete',
      task,
      execution,
      recorded,
    };
  };
}
