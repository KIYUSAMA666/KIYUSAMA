# NEVER SLEEP CORE v0.1 (KIYUSAMA OS 6.5X)

目的: AI(Claude/ChatGPT)が止まっている間も、OS自身が「仕事の台帳」を持って動き続け、
AIが起きたら handoff.md を読むだけで続きから始められる状態を作る。

## 3つの部品(これだけ)
1. jobs.json   : 仕事の台帳。各仕事に status(pending/running/done/failed/blocked) と 権限(GREEN/YELLOW/RED)
2. core.py     : 眠らない心臓。1回呼ぶと「期限が来た仕事を1件だけ」進め、heartbeat と handoff.md を更新する
3. handoff.md  : 引き継ぎ書。起きたAIは最初にこれだけ読む(自動生成。手で書かない)

## 守る決まり(既存の方針に合わせた)
- GREEN(読む・整理・下書き)だけ自動実行。YELLOW/RED は blocked にして親父の承認待ち(勝手に動かさない)
- 1回の呼び出しで進めるのは1件まで(暴走防止)
- 同じ仕事が2回連続で失敗したら failed にして止める(3回目はやらない=2エラー廃棄ルール)
- 失敗は理由を1行で記録。「確認できない」ことは「不明」と書き、断定しない
- 回線の再テストはしない。仕事の結果(done/failed)が回線の証拠になる

## 使い方
python3 core.py tick          # 1回進める(スケジューラから5分ごとに呼ぶ想定)
python3 core.py status        # いまの状態を表示
python3 core.py add "題名" --kind note --power GREEN --payload "内容"
python3 core.py approve <id>  # 親父が blocked の仕事を許可
python3 core.py selftest      # 動作確認(一時フォルダで実行)

## まだ作っていないもの(次の1歩候補)
- スケジューラへの接続(PCの定期タスク or クラウドの定期タスク)
- 仕事の種類(kind)の実体: 今は note(台帳にメモを残す)と check_file(ファイルの存在確認)のみ
- ChatGPT側の部屋が handoff.md を読む経路
