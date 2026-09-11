import {
  evaluateEndToEndTrustPipeline,
  type EndToEndTrustPipelineInput,
} from "./end-to-end-trust-pipeline.js";
import {
  applyStorageAtomicCommitAsync,
  type AnyStorageAtomicCommitBackend,
} from "./storage-atomic-commit-adapter.js";
import type { WriteBackAtomicCommit } from "./write-back.js";

/**
 * TRUSTED COMMIT ORCHESTRATOR v0.1
 *
 * Closes the final in-process seam between the verified end-to-end trust
 * pipeline and the atomic storage backend. Callers cannot supply an atomic
 * commit directly: it is derived internally from a READY_TO_COMMIT pipeline
 * decision and immediately handed to the backend adapter.
 *
 * Security note:
 * the verified atomic commit is deep-snapshotted before the backend property
 * is accessed. This prevents a hostile getter/proxy from mutating the original
 * caller-owned candidate after trust validation but before persistence.
 */

export type TrustedCommitOrchestratorStage =
  | "TRUST_PIPELINE"
  | "ATOMIC_COMMIT";

export type TrustedCommitOrchestratorDecision =
  | { status: "COMMITTED"; commitSequence: number }
  | {
      status: "HOLD";
      stage: TrustedCommitOrchestratorStage;
      reason: string;
      pipelineStage?: string;
    };

export interface TrustedCommitOrchestratorInput<T = unknown> {
  pipeline: EndToEndTrustPipelineInput<T>;
  backend: AnyStorageAtomicCommitBackend;
}

function snapshotAtomicCommit(commit: WriteBackAtomicCommit): WriteBackAtomicCommit {
  return JSON.parse(JSON.stringify(commit)) as WriteBackAtomicCommit;
}

export async function executeTrustedCommit<T = unknown>(
  input: TrustedCommitOrchestratorInput<T>,
): Promise<TrustedCommitOrchestratorDecision> {
  const pipelineDecision = evaluateEndToEndTrustPipeline(input.pipeline);
  if (pipelineDecision.status !== "READY_TO_COMMIT") {
    return {
      status: "HOLD",
      stage: "TRUST_PIPELINE",
      pipelineStage: pipelineDecision.stage,
      reason: pipelineDecision.reason,
    };
  }

  const verifiedCommit = snapshotAtomicCommit(pipelineDecision.atomicCommit);
  const backend = input.backend;
  const commitDecision = await applyStorageAtomicCommitAsync(backend, verifiedCommit);
  if (commitDecision.status !== "COMMITTED") {
    return {
      status: "HOLD",
      stage: "ATOMIC_COMMIT",
      reason: commitDecision.reason,
    };
  }

  return {
    status: "COMMITTED",
    commitSequence: commitDecision.commitSequence,
  };
}
