#!/usr/bin/env python3
"""NEVER SLEEP CORE v0.4 - 台帳・心臓・引き継ぎ書。標準ライブラリのみ。
v0.2: 二重実行を防ぐ鍵(ロック)を追加。承認した人を必ず記録する。
v0.3: Codex-K点検(2026-11-10)の指摘を反映。鍵に持ち主の印、他人の鍵は消さない/実行前に running を保存し落ちたら再実行しない/ID全長/保存はfsync+一意の一時ファイル。
v0.4: 出来事で動く。add --run(仕事が入ったらその場で動かす)と tick --all(空になるまで、上限つきで続けて動かす)。定期の時計は使わない。"""
import json, os, sys, time, uuid, argparse, tempfile, shutil, contextlib
HERE = os.environ.get("NSC_DIR", os.path.dirname(os.path.abspath(__file__)))
JOBS = os.path.join(HERE, "jobs.json")
BEAT = os.path.join(HERE, "heartbeat.json")
HAND = os.path.join(HERE, "handoff.md")
LOCK = os.path.join(HERE, "core.lock")
MAX_FAILS = 2
MAX_BATCH = 20        # tick --all で1回に進める最大件数(暴走防止)
LOCK_WAIT = 15.0      # 鍵を待つ最大秒数
LOCK_STALE = 60.0     # この秒数より古い鍵は、落ちた持ち主のものとして外す

def now(): return time.strftime("%Y-%m-%d %H:%M:%S")

@contextlib.contextmanager
def locked():
    """読む→変える→書くの間、他の実行を入れない。鍵ファイルに持ち主の印(token)を書き、自分の印のときだけ返す。"""
    token = uuid.uuid4().hex
    start = time.time()
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, token.encode()); os.close(fd)
            break
        except FileExistsError:
            try:
                if time.time() - os.path.getmtime(LOCK) > LOCK_STALE:
                    # 古い鍵は、いったん自分専用の名前に移してから、まだ古いことを確かめて捨てる(新しい鍵を巻き込まない)
                    mine = LOCK + ".stale." + token
                    os.rename(LOCK, mine)
                    if time.time() - os.path.getmtime(mine) > LOCK_STALE: os.remove(mine)
                    else:
                        try: os.rename(mine, LOCK)      # 新しい鍵だった: 戻す
                        except OSError: pass
                    continue
            except OSError: pass
            if time.time() - start > LOCK_WAIT: raise RuntimeError("鍵が取れない(他が作業中)")
            time.sleep(0.05)
    try: yield
    finally:
        try:
            with open(LOCK, encoding="utf-8") as f: owner = f.read()
            if owner == token: os.remove(LOCK)          # 自分の鍵のときだけ返す
        except OSError: pass

def load():
    if not os.path.exists(JOBS): return {"jobs": []}
    with open(JOBS, encoding="utf-8") as f: return json.load(f)
def save(d):
    tmp = JOBS + "." + uuid.uuid4().hex[:8] + ".tmp"      # 一時ファイルは毎回別名
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, JOBS)

# --- 仕事の種類(GREENだけ) ---
def run_note(j): return "メモを台帳に記録: " + j.get("payload", "")
def run_check_file(j):
    p = j.get("payload", "")
    if os.path.exists(p): return "存在を確認: " + p
    raise RuntimeError("ファイルが見つからない: " + p)
KINDS = {"note": run_note, "check_file": run_check_file}

def add(title, kind, power, payload):
    with locked():
        d = load(); jid = uuid.uuid4().hex
        st = "pending" if power == "GREEN" else "blocked"
        d["jobs"].append({"id": jid, "title": title, "kind": kind, "power": power, "payload": payload,
                          "status": st, "fails": 0, "created": now(), "log": []})
        save(d); handoff(d); return jid

def approve(jid, by):
    """承認した人(by)を必ず記録する。名前なしでは承認できない。"""
    by = (by or "").strip()
    if not by: raise ValueError("承認者の名前(--by)が必要")
    with locked():
        d = load()
        for j in d["jobs"]:
            if j["id"] == jid and j["status"] == "blocked":
                j["status"] = "pending"; j["approved"] = True
                j["approved_by"] = by; j["approved_at"] = now()
                j["log"].append(now() + " 承認: " + by); save(d); handoff(d); return True
        return False

def tick():
    with locked():
        d = load(); did = None
        # 前回の実行中に落ちた仕事は、二重実行を避けるため再実行しない(failed にして人/AIが確認する)
        for j in d["jobs"]:
            if j["status"] == "running":
                j["status"] = "failed"; j["log"].append(now() + " 前回の実行中に止まった可能性。二重実行を避けるため再実行しない。確認して作り直す")
        for j in d["jobs"]:
            if j["status"] != "pending": continue
            if j["power"] != "GREEN" and not (j.get("approved") and j.get("approved_by")):
                j["status"] = "blocked"; continue          # 承認者の記録がなければ動かさない
            fn = KINDS.get(j["kind"])
            if not fn:
                j["status"] = "failed"; j["log"].append(now() + " 不明な種類: " + j["kind"]); did = j["id"]; break
            j["status"] = "running"; j["log"].append(now() + " 開始"); save(d)   # 実行前に印を保存
            try:
                msg = fn(j); j["status"] = "done"; j["log"].append(now() + " OK " + msg)
            except Exception as e:
                j["fails"] += 1; j["log"].append(now() + " NG " + str(e))
                j["status"] = "failed" if j["fails"] >= MAX_FAILS else "pending"
            did = j["id"]; break                              # 1回に1件まで
        save(d)
        with open(BEAT, "w", encoding="utf-8") as f:
            json.dump({"last_tick": now(), "worked_on": did}, f, ensure_ascii=False)
        handoff(d); return did

def tick_all(limit=MAX_BATCH):
    """進める仕事がなくなるまで、上限つきで続けて動かす。動かした仕事のIDの一覧を返す。"""
    done = []
    for _ in range(limit):
        j = tick()
        if j is None: break
        done.append(j)
    return done

def handoff(d):
    c = {}
    for j in d["jobs"]: c[j["status"]] = c.get(j["status"], 0) + 1
    beat = ""
    if os.path.exists(BEAT):
        with open(BEAT, encoding="utf-8") as f: beat = json.load(f).get("last_tick", "")
    L = ["# 引き継ぎ書(自動生成・手で書かない)", "", "更新: " + now() + " / 最後の心拍: " + (beat or "不明"), "",
         "件数: " + ", ".join(k + "=" + str(v) for k, v in sorted(c.items())) if c else "件数: 仕事なし", ""]
    for title, st in [("承認待ち(blocked)", "blocked"), ("実行中(running)", "running"), ("失敗(failed) 理由を読んで直す", "failed"),
                      ("これから(pending)", "pending"), ("終わった(done) 直近5件", "done")]:
        js = [j for j in d["jobs"] if j["status"] == st]
        if st == "done": js = js[-5:]
        L.append("## " + title)
        if not js: L.append("- なし")
        for j in js:
            last = j["log"][-1] if j["log"] else ""
            L.append("- [%s] %s (%s, %s) %s" % (j["id"], j["title"], j["kind"], j["power"], last))
        L.append("")
    L += ["## 起きたAIの最初の手順", "1. この書類だけ読む。2. failed があれば理由を直す。3. blocked は承認者を決めて承認(--by 名前)。4. 回線の再テストはしない。"]
    with open(HAND, "w", encoding="utf-8") as f: f.write("\n".join(L) + "\n")

def selftest():
    global HERE, JOBS, BEAT, HAND, LOCK
    tmp = tempfile.mkdtemp(); HERE = tmp
    JOBS, BEAT, HAND, LOCK = (os.path.join(tmp, n) for n in ("jobs.json", "heartbeat.json", "handoff.md", "core.lock"))
    try:
        a = add("メモ", "note", "GREEN", "テスト")
        b = add("存在確認(ある)", "check_file", "GREEN", HAND if os.path.exists(HAND) else JOBS)
        c = add("存在確認(ない)", "check_file", "GREEN", os.path.join(tmp, "nothing"))
        r = add("外部送信", "note", "RED", "送らない")
        assert tick() == a; assert tick() == b          # 1回1件
        assert tick() == c; assert tick() == c          # 2回失敗で failed
        assert tick() is None                            # もう進める仕事なし
        d = load(); st = {j["id"]: j["status"] for j in d["jobs"]}
        assert st[a] == "done" and st[b] == "done" and st[c] == "failed" and st[r] == "blocked", st
        assert tick() is None
        try: approve(r, ""); assert False, "名前なしで承認できてしまった"
        except ValueError: pass
        assert approve(r, "oyaji") and tick() == r and {j["id"]: j["status"] for j in load()["jobs"]}[r] == "done"
        assert [j for j in load()["jobs"] if j["id"] == r][0]["approved_by"] == "oyaji"
        assert "failed" in open(HAND, encoding="utf-8").read()
        # v0.3: 落ちた running は再実行されず failed になる
        e = add("落ちた想定", "note", "GREEN", "x")
        dd = load()
        for j in dd["jobs"]:
            if j["id"] == e: j["status"] = "running"
        save(dd); tick()
        assert {j["id"]: j["status"] for j in load()["jobs"]}[e] == "failed"
        # v0.3: 他人の鍵は返さない
        with locked():
            with open(LOCK, "w", encoding="utf-8") as f: f.write("someone-else")
        assert os.path.exists(LOCK) and open(LOCK).read() == "someone-else"
        os.remove(LOCK)
        assert len(a) == 32                               # IDは全長
        # v0.4: tick_all は空になるまで進め、上限を超えない
        for i in range(3): add("連続%d" % i, "note", "GREEN", "x")
        got = tick_all(); assert len(got) == 3 and tick() is None, got
        for i in range(5): add("上限%d" % i, "note", "GREEN", "x")
        assert len(tick_all(limit=2)) == 2 and len(tick_all()) == 3
        assert not os.path.exists(LOCK)                  # 鍵は必ず返される
        print("SELFTEST OK")
    finally: shutil.rmtree(tmp)

if __name__ == "__main__":
    p = argparse.ArgumentParser(); s = p.add_subparsers(dest="cmd")
    t = s.add_parser("tick"); t.add_argument("--all", action="store_true"); s.add_parser("status"); s.add_parser("selftest")
    a = s.add_parser("add"); a.add_argument("title"); a.add_argument("--kind", default="note")
    a.add_argument("--power", default="GREEN", choices=["GREEN", "YELLOW", "RED"]); a.add_argument("--payload", default=""); a.add_argument("--run", action="store_true")
    ap = s.add_parser("approve"); ap.add_argument("id"); ap.add_argument("--by", default="")
    x = p.parse_args()
    if x.cmd == "tick": print("worked_on:", tick_all() if x.all else tick())
    elif x.cmd == "status": handoff(load()); print(open(HAND, encoding="utf-8").read())
    elif x.cmd == "add":
        jid = add(x.title, x.kind, x.power, x.payload); print("id:", jid)
        if x.run: print("worked_on:", tick_all())          # 出来事(仕事が入った)で、その場で動かす
    elif x.cmd == "approve":
        try: print("approved" if approve(x.id, x.by) else "not found / not blocked")
        except ValueError as e: print("拒否:", e); sys.exit(2)
    elif x.cmd == "selftest": selftest()
    else: p.print_help()
