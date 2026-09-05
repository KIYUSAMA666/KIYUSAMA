# Legacy Codex Adapter Wrapper — Design Boundary

This document defines the implementation boundary for PHASE 2 without altering the frozen PHASE 1 Contract baseline.

## Purpose

Convert the frozen TONTON DeliveryEnvelope-facing request into the historical Codex runner responsibility shape and convert the legacy execution result back into TONTON adapter/ACK/record evidence shapes.

## Boundary

Upstream TONTON stages remain authoritative for WATCH, WAKE and ROUTE.

The wrapper owns only the compatibility boundary around legacy Codex execution:

DELIVER -> legacy claim/execute/record -> ACK/RECORD compatibility output.

VERIFY is never self-issued by Codex or by this wrapper. The wrapper must return verification as pending/external-required. Independent VERIFY remains a separate stage.

## Non-goals

- No change to frozen Contract files.
- No main merge.
- No production provider activation.
- No COMMON MEMORY/Supabase activation.
- No CLEAN ROOM E2E in this step.
- No final VERIFIED status emitted by the executor wrapper.
