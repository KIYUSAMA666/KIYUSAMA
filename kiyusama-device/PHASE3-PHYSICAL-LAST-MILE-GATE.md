# PHASE 3 — Physical Last Mile Gate

Status: IN PROGRESS / NOT CONFIRMED

## Three-layer rule

1. Generally feasible
2. Implemented in DEVICE POC-001
3. Physical-device PASS

These states MUST NOT be conflated.

## PASS condition

Physical-device PASS is allowed only when one real end-to-end round trip is evidenced:

`physical double-tap -> input detection -> HTTPS -> Worker -> KIYUSAMA OS receipt -> ACK`

Required evidence:
- actual execution record
- raw device/receiver log
- actual HTTP request/response
- OS-side receipt record
- ACK record

Until all required evidence exists, the result is `IN PROGRESS` or `NOT CONFIRMED`.

## SORA invariant

Pressure, urgency, or a `GO` instruction may increase execution speed but MUST NOT lower the evidence threshold. No evidence means no PASS. Not executed means not completed. If implementation state cannot be verified, do not claim it is implemented.

## Independent audit

KIRA independently audits the evidence. SORA's implementation claim and KIRA's audit verdict are separate records.
