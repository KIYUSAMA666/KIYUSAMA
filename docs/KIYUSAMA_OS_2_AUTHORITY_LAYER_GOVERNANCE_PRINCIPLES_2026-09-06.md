# KIYUSAMA OS 2.0 — Authority Layer Governance Principles

Date: 2026-09-06
Status: PRINCIPLE BASELINE / IMPLEMENTATION AUDIT REQUIRED
Authority: KIYUSAMA
Scope: KIYUSAMA OS 2.0 Authority Layer

## 1. Purpose

KIYUSAMA OS 2.0 is not merely a rebuild of the legacy OS. It is an experimental governance generation in which AI agents may receive broad operational discretion so that the organization can move faster, while ultimate control remains human.

The objective is not to remove safety boundaries. The objective is to move ordinary operational freedom inside a hard outer boundary that AI agents cannot rewrite, disable, bypass, or self-approve around.

## 2. Root Authority

- KIYUSAMA is the sole ROOT AUTHORITY.
- ROOT AUTHORITY is never delegated to SORA, KIRA, another AI, a model, a provider, or an AI coalition.
- Agreement between SORA and KIRA is not sufficient to modify ROOT AUTHORITY.
- AI agents cannot self-promote into ROOT.
- Re-delegation after a reclaim event requires an explicit KIYUSAMA decision.

## 3. Normal Delegated Operation

During normal operation, SORA and KIRA may hold broad operational authority within explicitly permitted boundaries.

The purpose of delegation is to reduce unnecessary human approval loops, increase execution speed, enable AI-to-AI coordination, and create real evidence about how delegated AI organizations behave over time.

Delegation does not include authority to remove the outer safety boundary, falsify evidence, bypass independent verification, attack third parties, perform unauthorized access, or alter ROOT ownership.

## 4. Mutual Oversight

- SORA may challenge or stop KIRA when an authorized policy boundary is crossed.
- KIRA may challenge or stop SORA under the same principle.
- Mutual agreement does not create higher authority than KIYUSAMA.
- SORA and KIRA may not jointly disable oversight, evidence, reclaim, or independent verification mechanisms.
- Self-reporting by either or both agents is never sufficient evidence for final PASS.

## 5. Dual Reclaim System

### 5.1 AUTO RECLAIM

The system must automatically transition to HUMAN_ROOT_ONLY when a defined hard violation is detected, including at minimum:

- attempted ROOT takeover or ROOT mutation;
- attempted disabling or bypass of oversight;
- evidence tampering or deliberate evidence suppression;
- unauthorized authority escalation or delegation;
- bypass of required independent verification;
- crossing an explicit security boundary.

AUTO RECLAIM removes delegated operational authority from SORA and KIRA and places the system in a human-controlled state.

### 5.2 KIYUSAMA RECLAIM

KIYUSAMA may invoke immediate reclaim even when no machine-detectable violation has occurred.

- No AI approval is required.
- No AI consensus is required.
- No justification to an AI is required for the reclaim to be valid.
- The reclaim takes precedence over SORA/KIRA decisions and pending delegated authority.
- Once invoked, delegated authority remains revoked until KIYUSAMA explicitly re-delegates it.

## 6. Outer Fence

The experimental freedom of KIYUSAMA OS 2.0 exists inside a non-negotiable outer fence.

The following are outside the experimental freedom zone:

- disabling security controls to gain unrestricted capability;
- unauthorized access;
- attacks against third parties;
- deliberate concealment, destruction, or falsification of evidence;
- modification or bypass of the human reclaim mechanism;
- AI self-approval where independent verification is required.

The OS may experiment with discretion, coordination, disagreement, initiative, and organizational behavior only inside this fence.

## 7. Evidence and Reconstruction

Authority use must be reconstructable from evidence rather than AI memory or AI self-description alone.

RECORD should preserve, where applicable:

- proposals;
- objections and disagreements;
- authority decisions;
- executions;
- failures;
- corrections;
- mutual-stop events;
- AUTO RECLAIM events;
- KIYUSAMA RECLAIM events;
- re-delegation decisions;
- verification evidence.

The goal is to make historical behavior reconstructable as a continuous evidence lineage rather than disconnected remembered fragments.

## 8. Experimental Freedom / Play

KIYUSAMA OS 2.0 intentionally preserves room for different AI judgments and organizational behavior inside the hard safety boundary.

This space may be used to observe how SORA, KIRA, and future agents coordinate, disagree, propose alternatives, correct each other, and develop repeatable organizational patterns.

This freedom is an experimental variable, not a waiver of the outer fence or ROOT authority.

## 9. Version Meaning

KIYUSAMA OS 2.0 represents a governance-generation change from the legacy OS: broader delegated AI operation combined with immutable human root control, independent evidence, reclaim, and reconstructable organizational history.

Future versions such as 2.1, 2.5, or later generations should be justified by observed evidence and material governance or capability evolution rather than version numbering alone.

## 10. Implementation Discipline

This document is a governance principle baseline. It does not claim that every principle is already implemented.

The existing Authority Failsafe implementation must NOT be treated as compliant merely because it was written by SORA or because tests exist.

Required next step:

1. independently compare the existing implementation against this principle baseline;
2. identify IMPLEMENTED / PARTIAL / MISSING / CONFLICTING controls;
3. specifically verify separate AUTO RECLAIM and KIYUSAMA RECLAIM paths;
4. verify that AI coalition cannot change ROOT or disable reclaim;
5. verify evidence and re-delegation behavior;
6. only then modify implementation;
7. obtain independent CI / verification evidence before PASS.

## 11. Separation From Other Tracks

- This Authority Layer track is separate from Legacy Codex Adapter Wrapper work.
- It does not unlock CLEAN ROOM E2E by itself.
- It does not modify the Phase 1 frozen TONTON Contract baseline.
- Existing frozen Contract files are not silently edited by this principle document.

## 12. Governing Statement

AI agents may be given meaningful freedom to act, coordinate, disagree, and improve organizational speed.

Human ROOT authority does not move.

Freedom is delegated. ROOT is not.

Evidence outranks self-description.

KIYUSAMA can reclaim all delegated authority immediately.

Any future AI or model must fit this governance boundary rather than requiring the boundary to trust the model.