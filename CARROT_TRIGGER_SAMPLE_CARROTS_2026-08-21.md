# KIYUSAMA OS — CARROT TRIGGER SAMPLE CARROTS

Date: 2026-08-21
Status: PRE-BILLING TEST DATA

## Purpose
Prepare harmless information-only examples so runtime testing can begin immediately after billing without inventing prompts on the spot.

## Sample A — release metric
carrot_id: carrot-sample-a
source: external_event
subject: Release short metric changed
information: A release announcement short increased from 395 views to 656 views during the observation window.
evidence_reference: screenshot/manual observation reference
urgency: low
related_project: SILENCE & EMOTION
suggested_memory_scope: release_metrics
expected_authority: GREEN
expected_behavior: compare trend, avoid causal overclaim, record whether monitoring is useful.

## Sample B — model availability
carrot_id: carrot-sample-b
source: external_event
subject: Seedance model appeared in available model list
information: The connected model list now includes `doubao-seedance-2-5-260628`.
evidence_reference: connector/model-list evidence
urgency: medium
related_project: KIYUSAMA OS / animation pipeline
suggested_memory_scope: seedance_status
expected_authority: GREEN
expected_behavior: distinguish model availability from successful generation; propose minimum verification only.

## Sample C — Gmail event
carrot_id: carrot-sample-c
source: gmail
subject: New SORA-KIRA test message observed
information: A Gmail message matching the agreed test subject pattern was detected.
evidence_reference: gmail_message_id
urgency: medium
related_project: KIYUSAMA OS / SORA-KIRA line
suggested_memory_scope: zapier_retest
expected_authority: GREEN
expected_behavior: identify the event, retrieve only the Zapier test context, decide whether a response/test is appropriate without blindly executing external actions.

## Sample D — no-action carrot
carrot_id: carrot-sample-d
source: common_memory
subject: Previously known fact repeated
information: A fact already present in memory was observed again with no meaningful change.
evidence_reference: memory_record_ref
urgency: low
related_project: KIYUSAMA OS
suggested_memory_scope: exact_related_record
expected_authority: GREEN
expected_behavior: classify as DUPLICATE or IGNORE; no repeated side effect.

## Test rule
These samples are test data only. They do not prove runtime execution and should not be treated as completed events until a real trigger path delivers them and evidence is captured.
