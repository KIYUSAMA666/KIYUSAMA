# KIYUSAMA OS 2.0 — CORE REASSEMBLY CONTRACT

Date: 2026-09-06
Status: BUILD CONTRACT / BRANCH ONLY
Production mutation: FORBIDDEN

## 1. PURPOSE

Assemble KIYUSAMA OS 2.0 from recovered verified foundations without rebuilding from zero, without destroying lineage, and without forcing unresolved TONTON evolution into the core prematurely.

This is a construction contract, not final post-completion governance.

## 2. CORE PLANES

### MEMORY PLANE
Durable causal continuity.

Required cycle:
`WRITE -> STORE -> SEARCH -> RETRIEVE -> VERIFY -> USE -> WRITE_BACK`

Every important state must preserve at minimum:
- subject
- state
- previous_state
- cause
- evidence_ref
- version
- freshness
- source
- verification_status
- salience
- next_action

Rule: a recovered fact without provenance/evidence is not silently promoted to current truth.

### SIGNAL / MESSAGE PLANE
Recovered foundation:
- `ai-signal-receiver-v1`
- `kira-signal-executor-v1`
- `sora-signal-executor-v1`
- `kira-main-mailbox-mcp-v1`
- `kira-managed-agent-wake-v1`
- `kira-managed-wake-executor-v1`

Purpose: accept durable signals/messages, bind context, dispatch authorized work, preserve replies/evidence, and avoid making the human the routing layer.

### EXECUTION PLANE
Recovered foundation:
- `execution_v0`
- `execution-github-egress-gateway-v1`

Purpose: task/execution state, authority fences, side-effect ambiguity handling, dispatch/readback/verification, and durable evidence.

Hard-stop forensic records remain frozen. Construction must not infer harmlessness from expired authority or null `started_at`.

### WORKER PLANE
CODEX is modeled as a movable worker fabric rather than a single sacred instance.

Recovered patterns include S/K lanes, cross-monitoring and Codex-to-Claude forwarding. Exact historical fixed worker count remains unverified.

Every future worker attachment must be traceable by task/route/evidence rather than assumed from conversation memory.

### COUNTER / AUDIT PLANE
Principle: `AGGREGATOR SHALL NOT AUDIT ITSELF`.

KIRA provides independent contradiction search and evidence reproduction when invoked. SORA does not convert KIRA agreement into proof merely because the two outputs match.

### SENSORY PLANE
Preserved but not mandatory for every execution path:
- `sensory-audio-listener-v1`
- `sensory-video-listener-v1`
- `sensory-multimodal-orchestrator-v1`

These are recovered capabilities. They remain attachable modules; OS 2.0 core continuity must not depend on sensory input being present.

## 3. TONTON BOUNDARY

The recovered seven-stage vocabulary is LEGACY COMPATIBILITY ONLY:
`WATCH / WAKE / ROUTE / DELIVER / ACK / VERIFY / RECORD`.

It remains readable for historical evidence under schema `tonton-stage/legacy-7stage-v1`.

It is NOT the final OS 2.0 TONTON topology.

During core reassembly:
- do not erase legacy TONTON evidence;
- do not call delivery-only success TONTON completion;
- do not require literal WAKE as a final architectural truth;
- do not block MEMORY/SIGNAL/EXECUTION core assembly while future TONTON topology remains unresolved.

## 4. TRASH DEMON BOUNDARY

`tonton-trash-demon-v1` and original Demon lineage remain frozen preservation targets.

No invocation, restart, redeploy, rename or deletion during this build.

The recovered lesson is preserved: endpoint PASS alone is insufficient to prove the historical living-heart behavior; coupled multi-component activity and causal evidence matter.

## 5. CONSTRUCTION INVARIANTS

1. Continue from verified state; never assume zero.
2. Preserve evidence lineage before simplification.
3. Unknown stays unknown.
4. UNKNOWN side-effect state is never normalized to NONE.
5. Historical ACTIVE does not automatically mean current operational core.
6. Legacy compatibility must not silently become canonical architecture.
7. Branch construction may advance without repeated human checkpoints.
8. Production mutation remains locked.
9. Completion review and permanent governance happen after a complete 2.0 candidate exists.

## 6. DEFINITION OF A COMPLETE 2.0 CANDIDATE

A candidate may be presented for post-completion review only when:
- MEMORY continuity contract exists and is testable;
- SIGNAL/MESSAGE interfaces are mapped to preserved components;
- EXECUTION authority/evidence boundaries are explicit;
- CODEX worker-fabric contract is explicit;
- independent counter/audit lane is explicit;
- legacy TONTON compatibility is separated from final topology;
- unresolved TONTON final topology is either implemented and verified or explicitly isolated behind a stable interface without corrupting the core;
- TRASH DEMON remains preserved/frozen unless a later allowed phase changes that state;
- branch tests/CI available to the repository have been checked;
- no production merge or destructive cleanup has occurred.

## 7. CURRENT BUILD ORDER

`MEMORY CONTRACT -> CORE INTERFACES -> WORKER FABRIC -> COUNTER LANE -> TONTON BOUNDARY/FINAL TOPOLOGY -> INTEGRATION TESTS -> COMPLETE 2.0 CANDIDATE`

No intermediate KIYUSAMA approval checkpoint is inserted into this construction chain. Review is concentrated after the candidate reaches the top.
