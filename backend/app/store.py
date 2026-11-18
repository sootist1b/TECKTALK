"""SQLite 저장소와 업무 규칙.

FastAPI에 의존하지 않는 순수 파이썬 모듈이다. 라우터(main.py)는 이 모듈의 함수만 호출하고,
모든 변경 함수는 갱신된 전체 상태(state)를 돌려준다. 데이터가 작아서 프론트엔드는
응답으로 받은 상태로 화면을 통째로 다시 그린다.
"""
from __future__ import annotations

import calendar
import json
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

STATUSES = ("할 일", "진행 중", "완료")

PALETTE = [
    ("공통", "#F5B5B5"), ("LT", "#F7C5A6"), ("BP", "#F5DEA0"), ("EP", "#E6EFA8"),
    ("PMIX", "#BFE8B7"), ("DP", "#ACE4CE"), ("MP", "#A9E4E9"), ("GRP", "#B3D5F5"),
    ("ESP", "#C5C4F2"), ("CSP", "#DBC2F0"), ("ER", "#EFC5E6"), ("개인업무", "#E7CCD6"),
]
EXTRA_COLORS = ["#F1C6B7", "#EED9AA", "#CADFAE", "#B5DED7", "#BFD5F2", "#D6C8ED"]

MAILS = [
    {
        "id": "mail-1", "title": "LT 설비 점검 요청",
        "sender": "설비관리팀 <facilities@example.com>", "recipient": "demo", "at": "오늘 09:20",
        "attachments": [{"name": "LT_점검표.xlsx"}],
        "body": "안녕하세요.\n\nLT 설비의 온도 편차를 점검하고 결과를 공유해 주세요.\n센서 로그도 함께 확인 부탁드립니다.\n\n감사합니다.",
    },
    {
        "id": "mail-2", "title": "BP 공정 품질 개선 검토",
        "sender": "품질관리팀 <quality@example.com>", "recipient": "demo", "at": "오늘 08:45",
        "attachments": [],
        "body": "BP 공정 개선 항목을 검토하고 의견을 회신해 주세요.\n가능하면 개선 항목별 영향도도 작성 부탁드립니다.",
    },
    {
        "id": "mail-3", "title": "월간 설비 점검 일정 공유",
        "sender": "운영팀 <ops@example.com>", "recipient": "demo", "at": "어제 16:12",
        "attachments": [{"name": "월간_점검일정.pdf"}, {"name": "설비현황.xlsx"}],
        "body": "이번 달 설비 점검 일정을 공유드립니다.\n관련 부서에서는 일정 확인 부탁드립니다.",
    },
]

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS modules (
  name TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  module TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'demo',
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  start TEXT NOT NULL,
  "end" TEXT NOT NULL,
  mail_content TEXT,
  mail_source TEXT,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  start TEXT NOT NULL,
  "end" TEXT NOT NULL,
  position INTEGER NOT NULL
);
"""


class StoreError(Exception):
    """업무 규칙 위반. status는 HTTP 상태 코드로 그대로 쓰인다."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _tz() -> timezone:
    # 데모 데이터의 '오늘'은 한국 시간 기준이다. TZ_OFFSET_HOURS로 바꿀 수 있다.
    return timezone(timedelta(hours=float(os.environ.get("TZ_OFFSET_HOURS", "9"))))


def today() -> date:
    return datetime.now(_tz()).date()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"


def _check_date(value: str, label: str) -> str:
    try:
        date.fromisoformat(value)
    except (TypeError, ValueError):
        raise StoreError(f"{label} 형식이 올바르지 않습니다. (YYYY-MM-DD)")
    return value


def _check_range(start: str, end: str) -> None:
    _check_date(start, "시작일")
    _check_date(end, "종료일")
    if start > end:
        raise StoreError("종료일보다 늦게 시작하거나 시작일보다 일찍 끝날 수 없습니다.")


def _check_name(value: Optional[str]) -> str:
    name = (value or "").strip()
    if not name:
        raise StoreError("이름을 비워둘 수 없습니다.")
    return name


class Store:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)
        if self._conn.execute("SELECT COUNT(*) FROM modules").fetchone()[0] == 0:
            with self._tx() as cur:
                self._seed(cur)

    # ------------------------------------------------------------------ infra
    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Cursor]:
        with self._lock:
            cur = self._conn.cursor()
            try:
                cur.execute("BEGIN")
                yield cur
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    def _seed(self, cur: sqlite3.Cursor) -> None:
        t = today()
        last = calendar.monthrange(t.year, t.month)[1]

        def day(offset: int) -> str:
            d = min(max(1, t.day + offset), last)
            return date(t.year, t.month, d).isoformat()

        for i, (name, color) in enumerate(PALETTE):
            cur.execute("INSERT INTO modules(name,color,position) VALUES (?,?,?)", (name, color, i))
        projects = [
            ("project-lt", "LT 설비 안정화", "LT", "LT 설비의 주요 지표를 점검하고 이상 징후에 대응하는 월간 과제입니다.", [
                ("task-1", "설비 상태 점검", "온도·압력 센서 점검 및 기록 확인", "완료", day(-5), day(-3)),
                ("task-2", "이상 원인 분석", "센서 로그 확인 및 편차 발생 구간 분석", "진행 중", day(-2), day(2)),
                ("task-3", "개선안 검토", "개선안 비교 및 적용 범위 검토", "할 일", day(3), day(3)),
            ]),
            ("project-bp", "BP 공정 품질 개선", "BP", "BP 공정에서 발견된 품질 문제에 대한 개선 추진 과제", [
                ("task-4", "개선 항목 정리", "공정 데이터 및 품질 이슈 정리", "진행 중", day(-1), day(2)),
            ]),
            ("project-personal", "주간 업무 리뷰", "개인업무", "개인 일정 및 업무 회고", [
                ("task-5", "업무 주간 정리", "진행 항목 및 차주 우선순위 정리", "할 일", day(0), day(0)),
            ]),
        ]
        for pi, (pid, name, module, desc, tasks) in enumerate(projects):
            cur.execute(
                "INSERT INTO projects(id,name,module,owner,description,position) VALUES (?,?,?,?,?,?)",
                (pid, name, module, "demo", desc, pi),
            )
            for ti, (tid, tname, memo, status, start, end) in enumerate(tasks):
                cur.execute(
                    'INSERT INTO tasks(id,project_id,name,memo,status,start,"end",position) VALUES (?,?,?,?,?,?,?,?)',
                    (tid, pid, tname, memo, status, start, end, ti),
                )

    def reset(self) -> dict:
        with self._tx() as cur:
            for table in ("segments", "tasks", "projects", "modules"):
                cur.execute(f"DELETE FROM {table}")
            self._seed(cur)
        return self.state()

    # ------------------------------------------------------------------ read
    def state(self) -> dict:
        with self._lock:
            c = self._conn
            modules = [dict(r) for r in c.execute("SELECT name,color FROM modules ORDER BY position")]
            segs: dict[str, list] = {}
            for r in c.execute('SELECT id,task_id,start,"end" FROM segments ORDER BY position'):
                segs.setdefault(r["task_id"], []).append({"id": r["id"], "start": r["start"], "end": r["end"]})
            tasks: dict[str, list] = {}
            for r in c.execute('SELECT * FROM tasks ORDER BY position'):
                task: dict[str, Any] = {
                    "id": r["id"], "name": r["name"], "memo": r["memo"], "status": r["status"],
                    "start": r["start"], "end": r["end"], "segments": segs.get(r["id"], []),
                    "mailContent": r["mail_content"],
                    "mailSource": json.loads(r["mail_source"]) if r["mail_source"] else None,
                }
                tasks.setdefault(r["project_id"], []).append(task)
            projects = [
                {
                    "id": r["id"], "name": r["name"], "module": r["module"], "owner": r["owner"],
                    "description": r["description"], "tasks": tasks.get(r["id"], []),
                }
                for r in c.execute("SELECT * FROM projects ORDER BY position")
            ]
        return {"modules": modules, "projects": projects}

    @staticmethod
    def mails() -> list[dict]:
        return MAILS

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _next_pos(cur: sqlite3.Cursor, table: str, where: str = "", args: tuple = ()) -> int:
        row = cur.execute(f"SELECT COALESCE(MAX(position),-1)+1 FROM {table} {where}", args).fetchone()
        return int(row[0])

    @staticmethod
    def _module_exists(cur: sqlite3.Cursor, name: str) -> None:
        if not cur.execute("SELECT 1 FROM modules WHERE name=?", (name,)).fetchone():
            raise StoreError(f"존재하지 않는 모듈입니다: {name}")

    @staticmethod
    def _task_row(cur: sqlite3.Cursor, tid: str) -> sqlite3.Row:
        row = cur.execute('SELECT * FROM tasks WHERE id=?', (tid,)).fetchone()
        if not row:
            raise StoreError("소과제를 찾을 수 없습니다.", 404)
        return row

    # ------------------------------------------------------------------ modules
    def add_module(self, name: str) -> dict:
        name = _check_name(name)
        with self._tx() as cur:
            existing = [r[0].lower() for r in cur.execute("SELECT name FROM modules")]
            if name.lower() in existing:
                raise StoreError("이미 존재하는 모듈입니다.", 409)
            pos = self._next_pos(cur, "modules")
            color = EXTRA_COLORS[(pos - len(PALETTE)) % len(EXTRA_COLORS)]
            cur.execute("INSERT INTO modules(name,color,position) VALUES (?,?,?)", (name, color, pos))
        return self.state()

    # ------------------------------------------------------------------ projects
    def create_project(self, name: str = "새 대과제", module: str = "공통", owner: str = "demo",
                       description: str = "") -> tuple[str, dict]:
        name = _check_name(name)
        pid = _new_id("project")
        with self._tx() as cur:
            self._module_exists(cur, module)
            cur.execute(
                "INSERT INTO projects(id,name,module,owner,description,position) VALUES (?,?,?,?,?,?)",
                (pid, name, module, (owner or "demo").strip() or "demo", description or "",
                 self._next_pos(cur, "projects")),
            )
        return pid, self.state()

    def update_project(self, pid: str, changes: dict) -> dict:
        with self._tx() as cur:
            if not cur.execute("SELECT 1 FROM projects WHERE id=?", (pid,)).fetchone():
                raise StoreError("대과제를 찾을 수 없습니다.", 404)
            sets: dict[str, Any] = {}
            if changes.get("name") is not None:
                sets["name"] = _check_name(changes["name"])
            if changes.get("description") is not None:
                sets["description"] = changes["description"].strip()
            if changes.get("module") is not None:
                self._module_exists(cur, changes["module"])
                sets["module"] = changes["module"]
            if changes.get("owner") is not None:
                sets["owner"] = _check_name(changes["owner"])
            if sets:
                cols = ",".join(f"{k}=?" for k in sets)
                cur.execute(f"UPDATE projects SET {cols} WHERE id=?", (*sets.values(), pid))
        return self.state()

    def delete_project(self, pid: str) -> dict:
        with self._tx() as cur:
            if cur.execute("DELETE FROM projects WHERE id=?", (pid,)).rowcount == 0:
                raise StoreError("대과제를 찾을 수 없습니다.", 404)
        return self.state()

    # ------------------------------------------------------------------ tasks
    def create_task(self, pid: str, start: str, end: str, name: str = "새 소과제",
                    mail_id: Optional[str] = None) -> tuple[str, dict]:
        mail = None
        if mail_id:
            mail = next((m for m in MAILS if m["id"] == mail_id), None)
            if not mail:
                raise StoreError("메일을 찾을 수 없습니다.", 404)
            # 메일에서 등록한 소과제는 항상 오늘 하루짜리로 만든다.
            start = end = today().isoformat()
            name = mail["title"]
        _check_range(start, end)
        name = _check_name(name)
        tid = _new_id("task")
        with self._tx() as cur:
            if not cur.execute("SELECT 1 FROM projects WHERE id=?", (pid,)).fetchone():
                raise StoreError("대과제를 찾을 수 없습니다.", 404)
            cur.execute(
                'INSERT INTO tasks(id,project_id,name,memo,status,start,"end",mail_content,mail_source,position) '
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    tid, pid, name, "", "할 일", start, end,
                    mail["body"] if mail else None,
                    json.dumps({k: mail[k] for k in ("id", "title", "sender", "at", "body")}, ensure_ascii=False)
                    if mail else None,
                    self._next_pos(cur, "tasks", "WHERE project_id=?", (pid,)),
                ),
            )
        return tid, self.state()

    def update_task(self, tid: str, changes: dict) -> dict:
        with self._tx() as cur:
            row = self._task_row(cur, tid)
            sets: dict[str, Any] = {}
            if changes.get("name") is not None:
                sets["name"] = _check_name(changes["name"])
            if changes.get("memo") is not None:
                sets["memo"] = changes["memo"].strip()
            if changes.get("mailContent") is not None:
                sets["mail_content"] = changes["mailContent"].strip()
            if changes.get("status") is not None:
                if changes["status"] not in STATUSES:
                    raise StoreError("상태는 할 일 / 진행 중 / 완료 중 하나여야 합니다.")
                sets["status"] = changes["status"]
            start = changes.get("start") or row["start"]
            end = changes.get("end") or row["end"]
            if changes.get("start") is not None or changes.get("end") is not None:
                _check_range(start, end)
                sets["start"], sets['"end"'] = start, end
            if sets:
                cols = ",".join(f"{k}=?" for k in sets)
                cur.execute(f"UPDATE tasks SET {cols} WHERE id=?", (*sets.values(), tid))
        return self.state()

    def delete_task(self, tid: str) -> dict:
        with self._tx() as cur:
            if cur.execute("DELETE FROM tasks WHERE id=?", (tid,)).rowcount == 0:
                raise StoreError("소과제를 찾을 수 없습니다.", 404)
        return self.state()

    # ------------------------------------------------------------------ segments
    def create_segment(self, tid: str, start: str, end: str) -> dict:
        _check_range(start, end)
        with self._tx() as cur:
            self._task_row(cur, tid)
            cur.execute(
                'INSERT INTO segments(id,task_id,start,"end",position) VALUES (?,?,?,?,?)',
                (_new_id("seg"), tid, start, end, self._next_pos(cur, "segments", "WHERE task_id=?", (tid,))),
            )
        return self.state()

    def update_segment(self, sid: str, start: Optional[str], end: Optional[str]) -> dict:
        with self._tx() as cur:
            row = cur.execute('SELECT start,"end" FROM segments WHERE id=?', (sid,)).fetchone()
            if not row:
                raise StoreError("일정 구간을 찾을 수 없습니다.", 404)
            s, e = start or row["start"], end or row["end"]
            _check_range(s, e)
            cur.execute('UPDATE segments SET start=?,"end"=? WHERE id=?', (s, e, sid))
        return self.state()

    def delete_segment(self, sid: str) -> dict:
        with self._tx() as cur:
            if cur.execute("DELETE FROM segments WHERE id=?", (sid,)).rowcount == 0:
                raise StoreError("일정 구간을 찾을 수 없습니다.", 404)
        return self.state()
