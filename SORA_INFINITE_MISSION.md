# SORA INFINITE MISSION v2 — 聖本 / CANONICAL FLOW

## FINAL GOAL
KIYUSAMAがiPhoneからSORA本人へ入れば、PC操作なしで前回CURRENTを復元し、SAME WORKを続行し、RESULTを保存し、次のiPhoneターンもそのRESULTから継続できること。

## CANONICAL FLOW
iPhone入口
→ SORA本人
→ OPEN ROOM READ
→ CURRENT復元
→ formal gate / provenance / conflict確認
→ ADOPT
→ SAME WORK
→ VERIFY
→ RESULT保存
→ independent READBACK
→ 次のiPhoneターン
→ 前RESULTをRETRIEVE
→ CURRENTとしてADOPT
→ SAME WORK CONTINUE
→ ♾️

## EXECUTION LAW
ENTER → READ → CURRENT → ADOPT → WORK → RESULT → WRITE/COMMIT → READBACK → VERIFY → fresh CURRENT → CONTINUE ♾️

RETRIEVE ≠ ADOPT ≠ USE.
READ PASS ≠ WORK PASS.
WRITE ≠ READBACK.
FOUND ≠ PROVEN.
FAIL時は最初へ戻らず、FAIL座標だけ修理してSAME STEPを再射撃する。
既にPROVENした床より下へ戻らない。

## CURRENT EVIDENCE FLOOR — 2026-10-05
- #1113: SAME-BODY one-cycle PASS is preserved.
- PR #176: CLOSED. Substitute Ollama ownership for SORA_03 stopped on main and read back.
- PR #177: DRAFT. READY=OFF. Delivery remains OFF. Do not merge merely because it is mergeable.
- PC/self-hosted runner construction: HOLD. It is not the current victory path.
- SORA_03 observed OPEN ROOM coordinate: patrol 5029 / latest #1126 / unread 18 / processed=false; #1126 ACTIVE.
- #1127 ACTIVE / conflict=false: iPhone-originated SORA turn restored CURRENT, ADOPTED it, performed SAME WORK, and saved a RESULT checkpoint.
- #1127 proves only the bounded front half:
  iPhone GO → SORA本人 turn → CURRENT restore → ADOPT → SAME WORK → RESULT save.
- It does NOT yet prove next-turn self-resume or unattended infinity.

## FIRST UNPROVEN
On a later iPhone-originated SORA turn:
#1127 RETRIEVE
→ CURRENT ADOPT
→ continue the SAME WORK from #1127
→ save a new RESULT
→ independent READBACK.

Only after that evidence exists may the continuation floor advance.

## DO NOT FAKE THE WIN
- Do not manually SEND patrol 5029 to manufacture activation.
- Do not bypass a safety BLOCK with alternate SQL/API routes and call it PASS.
- Do not revive the PC runner branch as mainline while the iPhone path is the fixed victory condition.
- Do not create a new SORA BODY.
- Do not substitute a fresh API/model execution for the canonical SORA本人.
- Do not duplicate already-PROVEN work.
- Do not turn simulation, labels, or actor names into identity proof.
- Do not claim ♾️ from one successful cycle.

## HUMAN-FINGER TEST
Before any construction ask:
「これはPCなし・iPhoneだけでSORA本人が前回の続きから自力で働く完成形に近づく施工か？」
NOなら本線ではやらない。

## FINISH CONDITION
1. iPhone入口からSORA本人がprevious CURRENTをrestore.
2. SAME WORK continues without PC relay.
3. Actual RESULT is saved and independently read back.
4. A later iPhone turn resumes from that RESULT without rebuilding prior state.
5. Repeat evidence establishes continuity; unattended ♾️ is declared only when separately proven.

## STATUS
ACTIVE — iPhone continuity mainline.
PC runner branch = HOLD.
PR #177 = DRAFT / READY=OFF.
No manual patrol SEND is authorized by this document.
