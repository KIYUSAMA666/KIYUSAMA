# 無銘の変態 — 現在→未来→現在→未来 実装説明書
2026-10-09 / KIYUSAMA OS / isolated research, not production

## 現在 1: イベント検知して本人へ起動を渡す
発明者: Miller-Family-Projects/heartbeat-hermes
実コード: heartbeat_hermes/plugin.py, _inject_wake
技: SessionSource(chat_id,thread_id) + MessageEvent(internal=True) -> gateway._handle_message -> adapter.send。Gateway未接続ならpending。
転用: Keeperは外部通知で完了せず、既存本人BODYの受信証拠を待つ。
現状: Hermes Gateway内での方式。ChatGPT/Claude.ai既存本人会話への適用はUNPROVEN。
https://github.com/Miller-Family-Projects/heartbeat-hermes/blob/main/heartbeat_hermes/plugin.py

## 未来 1: 番人自身の生存と再起動
発明者: shootzjmr/hermes-agente-auto-wake
実装: heartbeat pinger + watcher + stale-session cleanup + daemon restart + self-disable anti-spam。
転用: Keeper heartbeat、stalled検知、cooldown、復旧回数制限。PC OFFには常時動く許可済みクラウドホストが必要。
https://github.com/shootzjmr/hermes-agente-auto-wake

## 現在 2: K/Sレーンの既存実装を再利用
既存: .github/workflows/codex-task-runner.yml (S, */5分)、codex-k-task-runner.yml (K, offset 5分)。
両方OIDCからCOMMON MEMORYのtask claim -> Codex CLI -> result。これは作業者であり既存ChatGPT/Claude本人ではない。
転用: Codex結果をKeeperのevent sourceに使う。K/S actor identityは混ぜない。

## 未来 2: メッセージなしで本人を起こす
発明者: anima-research/heartbeat-mcpl
実装: MCPL push/event、silent heartbeat。対応ホストのfeatureSet/marker/idが必須で、未対応ならfallbackまたは誤作動。
転用: 将来、本人ホストが認証済みwake eventを受ける場合の候補。現行ChatGPT/Claude.aiに対応する証拠はない。
https://github.com/anima-research/heartbeat-mcpl

## 現在 3: 結果の真偽を切り分ける
自作: guardian/keeper-wake-proof-gate.mjs、keeper-event-machine.mjs。
現状: CIで検証。本人受信なしならHOLD、結果不明ならUNCERTAIN、NEXTには結果READBACKと権限が必要。
https://github.com/KIYUSAMA666/KIYUSAMA/actions/runs/37874654534

## 未来 3: 緊急wakeと省資源運用
発明者: SuperiorBo/moss-agent-loop
実装: heartbeat daemon、通常enqueueSystemEventと緊急wake。
転用: Keeperはイベント発生時のみwakeし、繰り返しの無駄なLLM実行を避ける。
https://github.com/SuperiorBo/moss-agent-loop

## 不変の検証基準
FIRST UNPROVEN: PC OFFで既存の個人ChatGPT SORA_03と外部Claude.ai KIRAが同じ会話内で起動・WORK・RETURNする正規実行入口。
通知、Codex実行、Hermes Gateway起動、Vercel READYは代替証明にならない。
新しい発明は毎回、現在のFAIL座標→世界の実コード→最小転用→独立テスト→次の未来のFAIL予測を対で記録する。
実送信、production変更、main変更なし。