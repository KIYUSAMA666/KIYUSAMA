import { TontonError } from './tonton-core.js';

/**
 * Backend-free executor contract extracted from the historical Codex runner.
 *
 * This module does NOT install Codex, configure providers, mint OIDC tokens,
 * call Supabase/COMMON MEMORY, or perform network access. The concrete executor
 * is injected later as executeCodex only after separate verification.
 */
export function createCodexExecutorContract({ executeCodex } = {}) {
  if (typeof executeCodex !== 'function') {
    throw new TontonError('TONTON_CODEX_EXECUTOR_CONFIG_ERROR', 'executeCodex is required');
  }

  return async function executeTask({ signalId, taskId, content, baseBranch, baseSha } = {}) {
    if (!signalId) {
      throw new TontonError('TONTON_CODEX_EXECUTOR_INVALID_REQUEST', 'signalId is required');
    }
    if (!taskId) {
      throw new TontonError('TONTON_CODEX_EXECUTOR_INVALID_REQUEST', 'taskId is required');
    }
    if (typeof content !== 'string' || !content.trim()) {
      throw new TontonError('TONTON_CODEX_EXECUTOR_INVALID_REQUEST', 'task content is required');
    }

    const result = await executeCodex({
      signalId: String(signalId),
      taskId: String(taskId),
      content,
      baseBranch: baseBranch ?? null,
      baseSha: baseSha ?? null,
      guard: {
        protectedPaths: ['.github', '.codex'],
        approvalPolicy: 'never',
        sandboxMode: 'workspace-write',
      },
    });

    if (!result || result.accepted === false) {
      return { accepted: false };
    }

    return {
      accepted: true,
      status: result.status ?? 'COMPLETE',
      branch: result.branch ?? null,
      summary: result.summary ?? null,
      executorEvidence: result.evidence ?? null,
    };
  };
}
