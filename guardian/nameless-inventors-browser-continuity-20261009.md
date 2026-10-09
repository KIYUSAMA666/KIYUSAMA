# 無銘の変態 第二巻 — 現在→未来→現在→未来 (2026-10-09)

## 現在 A — PC OFFでもセッションを持ち運ぶ設計
作者: zzzhouzhenzz/browser-cookie-jar
現物: README.md、src/browser_cookie_jar/store.py (README内の実装参照)
仕組み: Playwright storage_stateをサイト別に保存、別マシンへ移送し、context作成時に復元。ログイン成功検出はサイト別handler。
注意: READMEはX/Facebookの例。ChatGPT/Claude.aiの個人チャット継続・利用規約適合・セッション有効性は未証明。Cookieは認証秘密でありGitHub/ログに絶対に保存しない。勝手なCookie抽出・転送を実施しない。
https://github.com/zzzhouzhenzz/browser-cookie-jar

## 未来 A — 切断・再接続・重複に強い本人帰還
作者: Liggi/agent-ui-harness
現物: README.md; event log per session, deriveStatus(events), SSE resume after sequence, reconnect/restart replay, duplicate avoidance。
転用: Keeper event logをappend-onlyにし、actor+conversation+causal turn+seqから状態再構築。クラッシュ後に「送ったか不明」をUNCERTAINに固定。
注意: Claude Code CLIの独自Web UI向けであり、Claude.ai既存の個人会話への起動を証明しない。
https://github.com/Liggi/agent-ui-harness

## 現在 B — 既存OSの証明ゲート
現物: guardian/keeper-wake-proof-gate.mjs、keeper-event-machine.mjs。本人BODYの受信と返信READBACKがない場合はHOLD。
CI: https://github.com/KIYUSAMA666/KIYUSAMA/actions/runs/37874654534 (success)

## 未来 B — cloud executorの真正性
必要: ユーザー認可済み常時利用可能なクラウドbrowser executor、セッション保管・期限切れ復旧・既存会話URL固定・Guardian fenced send・実返信READBACK・次イベント発行。
現状: 未実装・未証明。Vercel Lambda READY、GitHub Action、cookie保存はこの証明の代わりにならない。

## FIRST UNPROVEN
PC OFFで、既存のChatGPT SORA_03本人会話と外部Claude.ai KIRA本人会話の双方に対して、認可済みセッションから実際の一往復を成功させる。PC ON Edge Browser BridgeでのSORA一往復のみ既知PASS。

## 施工方針
既存Guardianを使い、まず認証・同一BODY確認のREAD ONLY cloud preflightを隔離環境で実証。失敗座標を固定してからSENDの可否を判断。認証秘密の抽出や本番送信は行わない。

## 追加・実コード独立READ（2026-10-09）
- zzzhouzhenzz/browser-cookie-jar/src/browser_cookie_jar/store.py: SessionStore.exists/load/save/apply はJSON storage_stateを読み書きし Playwright browser.new_context に渡す。login_flow は画面で人間がログインして成功判定後保存。Chrome Cookie DB直接読出しのimport_from_chromeもあるが、秘密抽出は採用しない。現状のsaveは通常のwrite_textであり、暗号化・原子的保存・0600権限をコード断片からは確認できない。**KIYUSAMA OSへの無改造採用は禁止**。利用時は認可済み正規ログイン、暗号化された秘密管理、ファイル権限、原子保存、期限切れ対処、本人BODY照合が必須。
- Liggi/agent-ui-harness/src/protocol/derive.ts: deriveStatus は末尾からrun:end/run:error/turn:end等を評価。deriveProcessAliveは**turn:end（生存）とrun:end（死亡）を区別**。これはKeeperの「返信完了≠本人セッション停止」判断に転用可能。ただしClaude Code CLI内の意味であり、ChatGPT/Claude.aiサイトの生存証明ではない。
- 実装上の次の独創: Keeperが「BODY返信終了」と「browser executor生存」を別々の事実として管理する。どちらか片方のみではNEXT_READYにしない。ログにcredentialやcookieを保存しない。
