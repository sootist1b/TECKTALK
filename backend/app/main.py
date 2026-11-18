"""TECHTALK_MEMSCM API.

- /api/*  : JSON API (로그인 없이 누구나 사용)
- 그 외   : 빌드된 React 앱(backend/static)을 정적 파일로 제공
변경 API는 모두 갱신된 전체 상태 {"state": {...}}를 돌려준다.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .store import Store, StoreError

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("DATABASE_PATH", str(BASE_DIR / "data" / "memscm.db"))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", str(BASE_DIR / "static")))

store = Store(DB_PATH)
app = FastAPI(title="TECHTALK_MEMSCM API", version="2.0.0")

origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if origins:
    app.add_middleware(
        CORSMiddleware, allow_origins=origins, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )


@app.exception_handler(StoreError)
async def store_error_handler(_: Request, exc: StoreError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


Status = Literal["할 일", "진행 중", "완료"]


class ModuleIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class ProjectCreate(BaseModel):
    name: str = "새 대과제"
    module: str = "공통"
    owner: str = "demo"
    description: str = ""


class ProjectPatch(BaseModel):
    name: Optional[str] = None
    module: Optional[str] = None
    owner: Optional[str] = None
    description: Optional[str] = None


class TaskCreate(BaseModel):
    start: str
    end: str
    name: str = "새 소과제"
    mailId: Optional[str] = None


class TaskPatch(BaseModel):
    name: Optional[str] = None
    memo: Optional[str] = None
    status: Optional[Status] = None
    start: Optional[str] = None
    end: Optional[str] = None
    mailContent: Optional[str] = None


class SegmentIn(BaseModel):
    start: str
    end: str


class SegmentPatch(BaseModel):
    start: Optional[str] = None
    end: Optional[str] = None


@app.get("/api/health")
def health():
    return {"ok": True}


# ---------------------------------------------------------------- data
@app.get("/api/state")
def get_state():
    return {"state": store.state()}


@app.get("/api/mails")
def get_mails():
    return {"mails": store.mails()}


@app.post("/api/reset")
def reset():
    return {"state": store.reset()}


@app.post("/api/modules")
def add_module(body: ModuleIn):
    return {"state": store.add_module(body.name)}


@app.post("/api/projects")
def create_project(body: ProjectCreate):
    pid, state = store.create_project(body.name, body.module, body.owner, body.description)
    return {"id": pid, "state": state}


@app.patch("/api/projects/{pid}")
def update_project(pid: str, body: ProjectPatch):
    return {"state": store.update_project(pid, body.model_dump(exclude_none=True))}


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    return {"state": store.delete_project(pid)}


@app.post("/api/projects/{pid}/tasks")
def create_task(pid: str, body: TaskCreate):
    tid, state = store.create_task(pid, body.start, body.end, body.name, body.mailId)
    return {"id": tid, "state": state}


@app.patch("/api/tasks/{tid}")
def update_task(tid: str, body: TaskPatch):
    return {"state": store.update_task(tid, body.model_dump(exclude_none=True))}


@app.delete("/api/tasks/{tid}")
def delete_task(tid: str):
    return {"state": store.delete_task(tid)}


@app.post("/api/tasks/{tid}/segments")
def create_segment(tid: str, body: SegmentIn):
    return {"state": store.create_segment(tid, body.start, body.end)}


@app.patch("/api/segments/{sid}")
def update_segment(sid: str, body: SegmentPatch):
    return {"state": store.update_segment(sid, body.start, body.end)}


@app.delete("/api/segments/{sid}")
def delete_segment(sid: str):
    return {"state": store.delete_segment(sid)}


# ---------------------------------------------------------------- SPA
if STATIC_DIR.is_dir():
    assets = STATIC_DIR / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        target = (STATIC_DIR / path).resolve()
        if path and target.is_file() and STATIC_DIR.resolve() in target.parents:
            return FileResponse(target)
        return FileResponse(STATIC_DIR / "index.html")
