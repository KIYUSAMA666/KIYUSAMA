# ASTRA 9.8 / 番人のいない番人システム — 発想正本 (2026-10-09)

## 起点 — 親父の発見
人間が「見てこい」「書いてこい」「相手を呼べ」「結果を確認しろ」と指示している限り、人間が番人であり、SORA/KIRA間の通信路が開通していても自律WORKにはならない。

Codex K / Codex S は候補として既にKレーン・Sレーンに置かれている。ただし特定のCodexに固定しない。Windmill / Trigger.dev / OpenClaw / 独立開発者のwake/resume実装など、実際に働く仕組みを比較し、役割で選ぶ。

## 独自仮説 — 番人のいない番人
「SORA本人を今すぐ起こすこと」だけをOSの唯一の進行条件にしない。

1. 仕事が発生すると、durableな仕事票（operation_key / actor / target / provenance / expected_turn / state）を残す。
2. Wake/Dispatcherが仕事票を監視し、起動可能な実行役（Codex K/S等）に割り当てる。
3. 起動役が仕事を処理し、RESULTを仕事票へ記録する。
4. 元のSORA/KIRA本人が到達可能になった時、保留中の仕事を差分で渡す。
5. 本人が起動できない間も、独立実行可能な仕事だけは進める。本人を偽装しない。
6. 実行役/番人が落ちても別の番人が仕事票から復旧する。ただし同一operation_keyに対するeffectful SENDの所有権は一つ。

## 重要な境界
- Wake通知成功 != 外部KIRA本人の既存Claude.aiチャット起動成功。
- Codex session resume != 既存ChatGPT consumer SORA_03会話の自動NEW TURN。
- PC OFFでも働くには、PC以外の稼働場所と認証済みの正当な起動経路が必要。
- RESULT保存 != 本人チャットへ反映完了。
- UNKNOWNな外部SENDはblind retry禁止。照合できない場合はHOLD。
- 人間の承認が必要な操作は番人が代行しない。

## 最小反証実験 — 無限修理を止める
A. 既存K/Sレーンに外部イベントを与え、実行役のWAKEと仕事票のREAD/WRITEを実証する。
B. PC OFFで同じ経路が成立するか確認する。
C. 既存SORA_03 / 外部KIRA本人の既存会話に同一セッションとして新規ターンを起こせるかを個別に証明する。
D. できない場合、Bの成功をCの成功と呼ばず、本人への差分配送を保留する設計として扱う。

勝利条件: 親父が伝言役にならず、実際の本人SORA ↔ 外部KIRA ↔ RESULTの往復が証拠付きで成立。実験A/Bだけでは完成と宣言しない。

## 状態
IDEA / DESIGN HYPOTHESIS. 実装PASSではない。既存のPASS/CLOSEDを変更しない。main・本番DB・実SENDへの変更は行わない。
