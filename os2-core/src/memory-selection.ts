export type MemoryClass =
  | "CURRENT"
  | "CONFIRMED"
  | "HISTORY"
  | "EVIDENCE"
  | "FAIL"
  | "REJECTED"
  | "DELETED"
  | "CLOSED";

export interface MemoryRecord<T = unknown> {
  id: string;
  memoryClass: MemoryClass;
  payload: T;
}

export type CandidateDecision<T = unknown> =
  | { status: "EXECUTION_CANDIDATE"; record: MemoryRecord<T> }
  | { status: "NOT_EXECUTABLE"; reason: "NON_CURRENT_MEMORY" };

/**
 * Normal execution selection is deliberately fail-closed:
 * only CURRENT may become an execution candidate.
 * Retrieval/search availability is a separate concern and never promotes
 * HISTORY/EVIDENCE/FAIL/REJECTED/DELETED/CLOSED/CONFIRMED into CURRENT.
 */
export function selectExecutionCandidate<T>(record: MemoryRecord<T>): CandidateDecision<T> {
  if (record.memoryClass !== "CURRENT") {
    return { status: "NOT_EXECUTABLE", reason: "NON_CURRENT_MEMORY" };
  }
  return { status: "EXECUTION_CANDIDATE", record };
}

export function selectExecutionCandidates<T>(records: ReadonlyArray<MemoryRecord<T>>): ReadonlyArray<MemoryRecord<T>> {
  return records.filter((record) => selectExecutionCandidate(record).status === "EXECUTION_CANDIDATE");
}
