KIYUSAMA OS 2.0 integration audit task.

Inspect the assembly branch contracts and tests under kiyusama-device/packages/contracts and kiyusama-device/tests/contracts.
Run npm run test:contracts.
Find and fix only implementation defects that prevent build/tests from passing or violate these invariants:
- no duplicate memory continuation schema/validator
- legacy seven-stage TONTON is compatibility only, not canonical 2.0 topology
- stateful core actions require authority
- confirmed side effects require evidence
- worker generation is fenced and ambiguity stays explicit
- producer/aggregator cannot audit itself
- delivered TONTON result requires delivery evidence
Do not modify production runtime, Supabase, Edge Functions, secrets, deployment routes, TRASH DEMON, or main.
Return concrete test results and changed paths.