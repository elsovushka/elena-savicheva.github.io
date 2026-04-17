import sqlite3
import json
import os
from datetime import datetime
from typing import Dict, List, Optional


class Database:
    def __init__(self, db_path: str = 'data/finmodel.db'):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS scenarios (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    name      TEXT NOT NULL,
                    params    TEXT NOT NULL,
                    results   TEXT NOT NULL,
                    created_at TEXT DEFAULT (datetime('now','localtime'))
                )
            """)

    def _conn(self):
        return sqlite3.connect(self.db_path)

    def save_scenario(self, name: str, params: Dict, results: Dict) -> int:
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO scenarios (name, params, results) VALUES (?, ?, ?)",
                (name, json.dumps(params, ensure_ascii=False), json.dumps(results, ensure_ascii=False))
            )
            return cur.lastrowid

    def load_scenario(self, scenario_id: int) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT id, name, params, results, created_at FROM scenarios WHERE id = ?",
                (scenario_id,)
            ).fetchone()
        if row:
            return {
                'id': row[0],
                'name': row[1],
                'params': json.loads(row[2]),
                'results': json.loads(row[3]),
                'created_at': row[4],
            }
        return None

    def list_scenarios(self) -> List[Dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id, name, created_at FROM scenarios ORDER BY created_at DESC"
            ).fetchall()
        return [{'id': r[0], 'name': r[1], 'created_at': r[2]} for r in rows]

    def delete_scenario(self, scenario_id: int):
        with self._conn() as conn:
            conn.execute("DELETE FROM scenarios WHERE id = ?", (scenario_id,))
