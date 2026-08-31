import { TontonError } from './tonton-core.js';

/**
 * Backend-free OS runner contract for TONTON integration proof.
 *
 * This contract intentionally has no Supabase/Google/Zapier/OIDC/network binding.
 * A concrete runner implementation must be injected later after separate verification.
 */
export function createOsRunnerDispatch({ runOs } = {}) {
  if (typeof runOs !== 'function') {
    throw new TontonError('TONTON_OS_RUNNER_CONFIG_ERROR', 'runOs is required');
  }

  return async function dispatchToOsRunner(request) {
    if (!request || request.kind !== 'TONTON_WAKE') {
      throw new TontonError('TONTON_OS_RUNNER_INVALID_REQUEST', 'TONTON_WAKE request is required');
    }
    if (!request.signalId) {
      throw new TontonError('TONTON_OS_RUNNER_INVALID_REQUEST', 'signalId is required');
    }

    const result = await runOs({
      kind: 'OS_RUNNER_REQUEST',
      sourceKind: request.kind,
      signalId: String(request.signalId),
      source: request.source ?? 'unknown',
      dedupeKey: request.dedupeKey ?? null,
      hint: request.payload?.hint ?? null,
    });

    if (result === false || result?.accepted === false) {
      return { accepted: false };
    }

    return {
      accepted: true,
      runnerResult: result ?? null,
    };
  };
}
