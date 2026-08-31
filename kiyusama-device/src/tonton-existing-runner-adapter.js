import { TontonError } from './tonton-core.js';

/**
 * Thin adapter from the historical OS runner responsibility shape into the
 * backend-neutral TONTON runner seam.
 *
 * This file contains NO concrete backend binding. The legacy-shaped functions
 * are injected so current workflow behavior can be verified/replaced without
 * activating COMMON MEMORY/Supabase or any provider runtime.
 *
 * Historical responsibility shape:
 *   claimTask -> executeTask -> recordResult
 *
 * Seam shape:
 *   taskSource -> executor -> resultSink
 */
export function createExistingRunnerAdapter({ claimTask, executeTask, recordResult } = {}) {
  if (typeof claimTask !== 'function') {
    throw new TontonError('TONTON_RUNNER_ADAPTER_CONFIG_ERROR', 'claimTask is required');
  }
  if (typeof executeTask !== 'function') {
    throw new TontonError('TONTON_RUNNER_ADAPTER_CONFIG_ERROR', 'executeTask is required');
  }
  if (typeof recordResult !== 'function') {
    throw new TontonError('TONTON_RUNNER_ADAPTER_CONFIG_ERROR', 'recordResult is required');
  }

  return {
    taskSource: async ({ signalId, source, dedupeKey, hint }) => {
      const claimed = await claimTask({ signalId, source, dedupeKey, hint });
      if (!claimed || claimed.accepted === false) {
        return { accepted: false };
      }
      return {
        accepted: true,
        taskId: claimed.taskId ?? claimed.knowledgeEntryId ?? null,
        content: claimed.content ?? null,
        baseBranch: claimed.baseBranch ?? null,
        baseSha: claimed.baseSha ?? null,
        legacyClaim: claimed,
      };
    },

    executor: async ({ signalId, task }) => {
      const executed = await executeTask({
        signalId,
        taskId: task.taskId,
        content: task.content,
        baseBranch: task.baseBranch,
        baseSha: task.baseSha,
      });
      if (!executed || executed.accepted === false) {
        return { accepted: false };
      }
      return {
        accepted: true,
        status: executed.status ?? 'COMPLETE',
        branch: executed.branch ?? null,
        summary: executed.summary ?? null,
        legacyExecution: executed,
      };
    },

    resultSink: async ({ signalId, task, execution }) => {
      const recorded = await recordResult({
        signalId,
        taskId: task.taskId,
        status: execution.status,
        branch: execution.branch,
        summary: execution.summary,
      });
      if (!recorded || recorded.accepted === false) {
        return { accepted: false };
      }
      return {
        accepted: true,
        receipt: recorded.receipt ?? null,
        legacyRecord: recorded,
      };
    },
  };
}
