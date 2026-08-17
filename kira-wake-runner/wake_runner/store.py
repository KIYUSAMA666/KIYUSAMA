from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute("""CREATE TABLE IF NOT EXISTS runs (
            message_id TEXT PRIMARY KEY, state TEXT NOT NULL, lease_until INTEGER,
            session_id TEXT, attempts INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL, result TEXT
        )""")
        self.db.commit()

    def claim(self, message_id: str, lease_seconds: int, now: int | None = None) -> tuple[bool, str | None]:
        now = int(time.time()) if now is None else now
        with self.lock, self.db:
            row = self.db.execute("SELECT * FROM runs WHERE message_id=?", (message_id,)).fetchone()
            if row and (row["state"] == "succeeded" or (row["state"] == "running" and row["lease_until"] > now)):
                return False, row["session_id"]
            if row:
                self.db.execute("UPDATE runs SET state='running', lease_until=?, attempts=attempts+1, updated_at=? WHERE message_id=?", (now + lease_seconds, now, message_id))
                return True, row["session_id"]
            self.db.execute("INSERT INTO runs(message_id,state,lease_until,attempts,updated_at) VALUES(?,'running',?,1,?)", (message_id, now + lease_seconds, now))
            return True, None

    def save_session(self, message_id: str, session_id: str) -> None:
        with self.lock, self.db:
            self.db.execute("UPDATE runs SET session_id=?, updated_at=? WHERE message_id=?", (session_id, int(time.time()), message_id))

    def finish(self, message_id: str, state: str, result: str = "") -> None:
        with self.lock, self.db:
            self.db.execute("UPDATE runs SET state=?, lease_until=NULL, result=?, updated_at=? WHERE message_id=?", (state, result, int(time.time()), message_id))

    def get(self, message_id: str):
        with self.lock:
            return self.db.execute("SELECT * FROM runs WHERE message_id=?", (message_id,)).fetchone()

