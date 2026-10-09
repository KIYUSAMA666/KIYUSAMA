import test from "node:test";
import assert from "node:assert/strict";
import { evaluateKeeperWake } from "./keeper-wake-proof-gate.mjs";
import { keeperTransition } from "./keeper-event-machine.mjs";

// This is a negative security demonstration of a trust boundary, NOT a live wake proof.
// The caller supplies self-asserted booleans; no authenticated observation source is involved.
test("untrusted self-asserted observation is accepted by pure proof predicate", () => {
  const event = {eventId:"adversarial-event",targetActor:"SORA_03",conversationId:"original-chat",causalTurnId:"causal-turn"};
  const forged = {eventId:event.eventId,actor:event.targetActor,conversationId:event.conversationId,
    authenticated:true,sameExistingBody:true,acceptedCausalTurnId:event.causalTurnId,
    actualAssistantTurnId:"made-up-turn",replyReadback:true,streamEnded:true};
  const result = evaluateKeeperWake({event,observation:forged});
  assert.equal(result.status,"WAKE_VERIFIED");
  // No actual original-chat observation was made. A producer/attestation boundary is required.
});

test("matching caller-created WAKE_VERIFIED status can advance pure state machine", () => {
  const base={eventId:"adversarial-event",actor:"SORA_03",conversationId:"original-chat",revision:2,status:"WAKE_REQUESTED"};
  const claimed={status:"WAKE_VERIFIED",eventId:base.eventId,actor:base.actor,conversationId:base.conversationId};
  const result=keeperTransition(base,{type:"CONFIRM_BODY",eventId:base.eventId,expectedRevision:base.revision,proof:claimed});
  assert.equal(result.status,"BODY_CONFIRMED");
  // The state machine must only be called after trusted external verification.
});
