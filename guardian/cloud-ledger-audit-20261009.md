# Cloud ledger audit

Read-only inspection findings, 2026-10-09.

The existing root-task checkpoint save routine validates expected revision under a transaction-scoped advisory lock. The fenced variant checks owner ID, lease token, fence epoch, and lease expiry under a row lock.

Guardian's local ledger implementation is not shared across serverless instances. A cloud adapter must use durable shared state, serialize competing transitions, and preserve causal turn identity.

No existing personal ChatGPT thread send from a PC-off cloud runtime has been verified. No database mutation or live message send was performed for this audit.
