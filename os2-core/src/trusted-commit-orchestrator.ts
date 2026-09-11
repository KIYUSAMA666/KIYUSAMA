import {
  evaluateEndToEndTrustPipeline,
  type EndToEndTrustPipelineInput,
} from "./end-to-end-trust-pipeline.js";
import {
  applyStorageAtomicCommit,
  type StorageAtomicCommitBackend,
} from "./storage-atomic-commit-adapter.js";

/**
 * TRUSTED COMMIT ORCHESTRATOR v0.1
 *
 * Closes the final in-process seam between the verified end-to-end trust
 * pipeline and the atomic storage backend. Callers cannot supply an atomic
 * commit directly: it is derived internally from a READY_TO_COMMIT pipeline
 * decision and immediately handed to the backend adapter.
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
  backend: StorageAtomicCommitBackend;
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

  const commitDecision = await applyStorageAtomicCommit(
    input.backend,
    pipelineDecision.atomicCommit,
  );
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
