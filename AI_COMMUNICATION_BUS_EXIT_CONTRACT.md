# AI COMMUNICATION BUS — EXIT CONTRACT v0.1

Status: DRAFT FOR INDEPENDENT AUDIT

Base main at creation: `931094a962e184206a09924d7f0f50722b4bed00`

This contract is governed by `MULTI_AI_ROOM_V1_RELEASE_GATE.md`. It does not change EXIT CONTRACT semantics, V1 BLOCKER classification, HUNT BUDGET, REOPEN KEY, or the locked v1 phase order.

## Purpose

Close the AI COMMUNICATION BUS phase only when SORA / KIRA / 3号 / 5号 can exchange one durable, authority-bound conversation/event round trip through a shared bus without duplicate delivery, cross-recipient leakage, self-loop amplification, stale-state execution, or loss of unresolved delivery state across restart.

## Functional path

AI COMMUNICATION BUS closes when all of the following are independently evidenced against the current main line:

- one sender can publish one message/event with a unique messageId, traceId, sourceAgentId, targetAgentId, source CURRENT state/revision binding, and createdAt;
- routing delivers the message only to the declared target agent and does not broadcast authority-bearing payloads to unrelated agents;
- the target can acknowledge receipt and publish one reply bound to the original trace/message relationship;
- the reply routes back to the original sender through the same bus contract;
- delivery state is durable enough that a fresh process/restart can distinguish pending, delivered/acknowledged, and terminally failed messages without inventing a new delivery;
- duplicate publish/delivery/ack/reply attempts are idempotent or HOLD and never create duplicate execution authority;
- message transport never grants execution authority by itself: any executable action still passes COMMON MEMORY + ROLE/AUTHORITY gates;
- KIYUSAMA remains final authority and a bus message cannot override protected human authority/control state.

## Predefined attack set

- duplicate publish of the same messageId -> at most one durable message identity;
- duplicate delivery attempt -> at most one accepted delivery for the same recipient/message;
- duplicate ACK -> idempotent or HOLD, never a second execution/delivery authority;
- duplicate reply for the same reply identity -> at most one durable reply;
- wrong targetAgentId / cross-recipient substitution -> HOLD;
- forged sourceAgentId -> HOLD;
- source/target agent equality causing unauthorized self-loop -> HOLD unless explicitly allowed by a future contract; v1 default is no self-loop;
- stale or foreign CURRENT state/revision binding -> HOLD before execution use;
- reply with wrong parent message/trace -> HOLD;
- ACK from an agent other than the declared recipient -> HOLD;
- message replay after terminal delivery/ACK -> no duplicate downstream execution;
- malformed/blank messageId, traceId, sourceAgentId, targetAgentId, or timestamps -> HOLD without throwing;
- unknown/ambiguous delivery outcome -> durable UNKNOWN/PENDING-style state, no blind retry that could duplicate delivery;
- restart must not convert an unresolved message into a fresh unsafely executable message;
- transport payload cannot mutate `activeRolesAndAuthority`, `humanDecisionFinal`, or other protected CURRENT control fields;
- bus receipt/message metadata cannot be treated as independent evidence or KIRA PASS unless separately verified by the independent lane;
- recipient failure/backend failure cannot be reported as delivered/ACKed without evidence;
- message order/retry behavior cannot allow a stale reply to supersede a newer CURRENT-bound conversation state.

## Closure sequence

`functional path PASS -> predefined attack set PASS -> KIRA independent PASS -> 3号 Final Hunt x1 -> no unresolved V1 BLOCKER -> AI COMMUNICATION BUS CLOSED -> ROOM UI starts`

No additional BUS attack condition may be added to v1 merely because it is interesting. A new condition must first satisfy the locked V1 BLOCKER RULE.
