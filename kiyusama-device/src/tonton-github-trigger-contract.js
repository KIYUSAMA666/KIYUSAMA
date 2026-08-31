// TONTON GitHub trigger contract
// This module is intentionally backend-agnostic. It does not call GitHub,
// COMMON MEMORY, Supabase, Gmail, Zapier, or any production runtime.
//
// Purpose:
// - represent the already-existing GitHub-native knock pattern
// - keep TONTON as a lightweight signal
// - fail closed unless a separately verified trigger dispatcher is supplied

export class TontonGithubTriggerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TontonGithubTriggerError';
    this.code = code;
  }
}

export function buildTontonTriggerArtifact(signal) {
  if (!signal || typeof signal !== 'object') {
    throw new TontonGithubTriggerError('TONTON_TRIGGER_SIGNAL_REQUIRED', 'signal object is required');
  }

  const signalId = String(signal.id ?? '').trim();
  if (!signalId) {
    throw new TontonGithubTriggerError('TONTON_TRIGGER_SIGNAL_ID_REQUIRED', 'signal.id is required');
  }

  const source = String(signal.source ?? 'unknown').trim() || 'unknown';
  const safeId = signalId.replace(/[^A-Za-z0-9._-]/g, '_');

  return {
    path: `.codex/trigger/tonton-${safeId}.json`,
    content: JSON.stringify({
      type: 'TONTON_WAKE',
      signalId,
      source,
      dedupeKey: signal.dedupeKey ?? null,
      occurredAt: signal.occurredAt ?? null,
      hint: signal.hint ?? null,
    }, null, 2) + '\n',
  };
}

export async function dispatchTontonGithubTrigger(signal, { dispatchTrigger } = {}) {
  if (typeof dispatchTrigger !== 'function') {
    throw new TontonGithubTriggerError(
      'TONTON_TRIGGER_DISPATCH_UNVERIFIED',
      'verified dispatchTrigger implementation is required',
    );
  }

  const artifact = buildTontonTriggerArtifact(signal);
  const result = await dispatchTrigger(artifact, signal);

  if (result === false || result?.accepted === false) {
    throw new TontonGithubTriggerError('TONTON_TRIGGER_REJECTED', 'trigger dispatcher rejected TONTON artifact');
  }

  return {
    ok: true,
    path: artifact.path,
    dispatchResult: result ?? null,
  };
}
