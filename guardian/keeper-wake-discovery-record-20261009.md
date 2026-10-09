# KIYUSAMA OS — 番人の発明調査・証拠記録 (2026-10-09)

## 指令
「お」= OPEN ROOM。親父の手動『見てこい・起きろ・書いてこい』を代行する番人を探す。既存K/Sレーンを保持し、新しいOSを作り直さない。通知だけでは不合格。

## 世界の実コードとREADMEの独立READ
1. Miller-Family-Projects/heartbeat-hermes: heartbeat_hermes/plugin.py の _inject_wake は SessionSource(chat_id,thread_id) + internal MessageEvent を生成し、GatewayRunner._handle_message(event) を呼び、adapter.sendで返答する。Gateway不在はpending。これはHermesの本人セッションであり、ChatGPT/Claude.ai既存会話の証明ではない。
2. anima-research/heartbeat-mcpl: push/event heartbeat。silent wakeは対応hostと正確な設定が必要。
3. SuperiorBo/moss-agent-loop: Gateway内heartbeat daemon、通常enqueueSystemEventと緊急wake。
4. shootzjmr/hermes-agente-auto-wake: systemd timer、heartbeat、zombie検出、daemon再起動。
5. openlegion-ai/openlegion: src/browser/session_persistence.pyでBrowserContext状態の保存と復元。本人ChatGPT/Claudeログイン互換性は未証明。

## KIYUSAMA独自の合成案
KEEPER WAKE HANDOFF v1: 新着を監視→durable CASで仕事を取得→既存BODYの許可済み入口へwake→本人が実際に受信した証拠を確認→WORK結果検証→一度だけNEXTを発行。K/Sを混同しない。キューやCodexの起動だけで本人の起動成功とは判定しない。

## 確認済み / 未確認
PC ON Edge Browser Bridgeによる既存ChatGPT会話SEND/返信READBACKとiPhone同期はPASS。Guardian隔離CI PostgreSQL run 37868545798、RETURN run 37868545713 はSUCCESS。Vercel READY LAMBDASは常駐ブラウザの証明ではない。PC OFFでの既存ChatGPT・外部Claude本人wake/SENDはUNPROVEN。

## FIRST UNPROVEN
K/S各レーンで実在する正規BODY入口を特定し、PC OFFのまま同一会話本人が受信・WORK・返答するか実証する。入口なしならPENDING、SEND不確実ならUNCERTAINとして再送しない。認証情報の抽出、制限回避、新規代理会話、mainへの無断統合はしない。

## 参照
https://github.com/Miller-Family-Projects/heartbeat-hermes
https://github.com/anima-research/heartbeat-mcpl
https://github.com/SuperiorBo/moss-agent-loop
https://github.com/shootzjmr/hermes-agente-auto-wake
https://github.com/openlegion-ai/openlegion
https://github.com/KIYUSAMA666/KIYUSAMA/blob/sora/guardian-return-isolated-check-20261009/guardian/keeper-wake-handoff-v1.md

STATUS: evidence record only. No production SEND / main merge / production DB mutation.