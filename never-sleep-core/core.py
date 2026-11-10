#!/usr/bin/env python3
"""NEVER SLEEP CORE v0.1 - 台帳・心臓・引き継ぎ書。標準ライブラリのみ。"""
import json, os, sys, time, uuid, argparse, tempfile, shutil
HERE = os.environ.get("NSC_DIR", os.path.dirname(os.path.abspath(__file__)))
JOBS = os.path.join(HERE, "jobs.json")
BEAT = os.path.join(HERE, "heartbeat.json")
HAND = os.path.join(HERE, "handoff.md")
MAX_FAILS = 2

def now(): return time.strftime("%Y-%m-%d %H:%M:%S")
def load():
    if not os.path.exists(JOBS): return {"jobs": []}
    with open(JOBS, encoding="utf-8") as f: return json.load(f)
def save(d):
    tmp = JOBS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, indent=2)
    os.replace(tmp, JOBS)

# --- 仕事の種類(GREENだけ) ---
def run_note(j): return "メモを台帳に記録: " + j.get("payload", "")
def run_check_file(j):
    p = j.get("payload", "")
    if os.path.exists(p): return "存在を確認: " + p
    raise RuntimeError("ファイルが見つからない: " + p)
KINDS = {"note": run_note, "check_file": run_check_file}

def add(title, kind, power, payload):
    d = load(); jid = uuid.uuid4().hex[:6]
    st = "pending" if power == "GREEN" else "blocked"
    d["jobs"].append({"id": jid, "title": title, "kind": kind, "power": power, "payload": payload,
                      "status": st, "fails": 0, "created": now(), "log": []})
    save(d); handoff(d); return jid

def approve(jid):
    d = load()
    for j in d["jobs"]:
        if j["id"] == jid and j["status"] == "blocked":
            j["status"] = "pending"; j["approved"] = True; j["log"].append(now() + " 親父が承認"); save(d); handoff(d); return True
    return False

def tick():
    d = load(); did = None
    for j in d["jobs"]:
        if j["status"] != "pending": continue
        if j["power"] != "GREEN" and not j.get("approved"):
            j["status"] = "blocked"; continue          # 念のため二重チェック
        fn = KINDS.get(j["kind"])
        if not fn:
            j["status"] = "failed"; j["log"].append(now() + " 不明な種類: " + j["kind"]); did = j["id"]; break
        try:
            msg = fn(j); j["status"] = "done"; j["log"].append(now() + " OK " + msg)
        except Exception as e:
            j["fails"] += 1; j["log"].append(now() + " NG " + str(e))
            if j["fails"] >= MAX_FAILS: j["status"] = "failed"   # 3回目はやらない
        did = j["id"]; break                              # 1回に1件まで
    save(d)
    with open(BEAT, "w", encoding="utf-8") as f:
        json.dump({"last_tick": now(), "worked_on": did}, f, ensure_ascii=False)
    handoff(d); return did

def handoff(d):
    c = {}
    for j in d["jobs"]: c[j["status"]] = c.get(j["status"], 0) + 1
    beat = ""
    if os.path.exists(BEAT):
        with open(BEAT, encoding="utf-8") as f: beat = json.load(f).get("last_tick", "")
    L = ["# 引き継ぎ書(自動生成・手で書かない)", "", "更新: " + now() + " / 最後の心拍: " + (beat or "不明"), "",
         "件数: " + ", ".join(k + "=" + str(v) for k, v in sorted(c.items())) if c else "件数: 仕事なし", ""]
    for title, st in [("親父の承認待ち(blocked)", "blocked"), ("失敗(failed) 理由を読んで直す", "failed"),
                      ("これから(pending)", "pending"), ("終わった(done) 直近5件", "done")]:
        js = [j for j in d["jobs"] if j["status"] == st]
        if st == "done": js = js[-5:]
        L.append("## " + title)
        if not js: L.append("- なし")
        for j in js:
            last = j["log"][-1] if j["log"] else ""
            L.append("- [%s] %s (%s, %s) %s" % (j["id"], j["title"], j["kind"], j["power"], last))
        L.append("")
    L += ["## 起きたAIの最初の手順", "1. この書類だけ読む。2. failed があれば理由を直す。3. blocked は親父に聞く。4. 回線の再テストはしない。"]
    with open(HAND, "w", encoding="utf-8") as f: f.write("\n".join(L) + "\n")

def selftest():
    global HERE, JOBS, BEAT, HAND
    tmp = tempfile.mkdtemp(); HERE = tmp
    JOBS, BEAT, HAND = (os.path.join(tmp, n) for n in ("jobs.json", "heartbeat.json", "handoff.md"))
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
        assert approve(r) and tick() == r and {j["id"]: j["status"] for j in load()["jobs"]}[r] == "done"
        assert "failed" in open(HAND, encoding="utf-8").read()
        print("SELFTEST OK")
    finally: shutil.rmtree(tmp)

if __name__ == "__main__":
    p = argparse.ArgumentParser(); s = p.add_subparsers(dest="cmd")
    s.add_parser("tick"); s.add_parser("status"); s.add_parser("selftest")
    a = s.add_parser("add"); a.add_argument("title"); a.add_argument("--kind", default="note")
    a.add_argument("--power", default="GREEN", choices=["GREEN", "YELLOW", "RED"]); a.add_argument("--payload", default="")
    ap = s.add_parser("approve"); ap.add_argument("id")
    x = p.parse_args()
    if x.cmd == "tick": print("worked_on:", tick())
    elif x.cmd == "status": handoff(load()); print(open(HAND, encoding="utf-8").read())
    elif x.cmd == "add": print("id:", add(x.title, x.kind, x.power, x.payload))
    elif x.cmd == "approve": print("approved" if approve(x.id) else "not found / not blocked")
    elif x.cmd == "selftest": selftest()
    else: p.print_help()
