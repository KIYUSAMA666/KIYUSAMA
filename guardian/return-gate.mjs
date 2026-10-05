import { GuardianState } from "./control-core.mjs";

export class ReturnGateError extends Error {
  constructor(reason) {
    super("RETURN_BLOCKED: " + reason);
    this.name = "ReturnGateError";
    this.reason = reason;
  }
}

export function verifyReturnPrerequisites({
  bodyId, ownerId, workId, ledger,
  expectedUserTurnId, assistantTurnId,
  causalUserTurnId, streamEnded, contentStable, sameBody,
}) {
  const deny = reason => { throw new ReturnGateError(reason); };
  if (!bodyId || !ownerId || !workId || !ledger) deny("RETURN_CONTEXT_REQUIRED");

  const entry = ledger.get(bodyId);
  if (!entry || entry.state !== GuardianState.SENDING ||
      entry.sendStarted !== true || entry.resultCommitted === true)
    deny("SEND_STARTED_REQUIRED");
  if (entry.bodyId !== bodyId || entry.ownerId !== ownerId || entry.workId !== workId)
    deny("RETURN_COORDINATE_MISMATCH");

  if (!expectedUserTurnId || causalUserTurnId !== expectedUserTurnId)
    deny("CAUSAL_USER_TURN_MISMATCH");
  if (!assistantTurnId || assistantTurnId === expectedUserTurnId)
    deny("NEW_ASSISTANT_TURN_REQUIRED");
  if (streamEnded !== true) deny("STREAM_NOT_ENDED");
  if (contentStable !== true) deny("CONTENT_NOT_STABLE");
  if (sameBody !== true) deny("SAME_BODY_NOT_PROVEN");

  return { bodyId, ownerId, workId, expectedUserTurnId, assistantTurnId, seq: entry.seq };
}

export function commitReturnResult(args) {
  const proof = verifyReturnPrerequisites(args);
  const current = args.ledger.get(args.bodyId);
  const written = args.ledger.record(args.bodyId, {
    ...current,
    state: GuardianState.RESULT_COMMITTED,
    resultCommitted: true,
    expectedUserTurnId: proof.expectedUserTurnId,
    assistantTurnId: proof.assistantTurnId,
  });
  const saved = args.ledger.get(args.bodyId);
  if (!saved || saved.seq !== written.seq ||
      saved.state !== GuardianState.RESULT_COMMITTED ||
      saved.resultCommitted !== true ||
      saved.expectedUserTurnId !== proof.expectedUserTurnId ||
      saved.assistantTurnId !== proof.assistantTurnId)
    throw new ReturnGateError("RESULT_COMMIT_READBACK_FAILED");
  return saved;
}
