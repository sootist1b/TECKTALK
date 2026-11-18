"""TECHTALK_MEMSCM API.

- /api/*  : JSON API (로그인 외에는 Bearer 토큰 필요)
- 그 외   : 빌드된 React 앱(backend/static)을 정적 파일로 제공
변경 API는 모두 갱신된 전체 상태 {"state": {...}}를 돌려준다.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .auth import check_login, issue_token, verify_token
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


def current_user(authorization: Optional[str] = Header(default=None)) -> str:
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else None
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return user


Status = Literal["할 일", "진행 중", "완료"]


class LoginIn(BaseModel):
    username: str
    password: str


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


# ---------------------------------------------------------------- public
@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/auth/login")
def login(body: LoginIn):
    if not check_login(body.username.strip(), body.password):
        raise HTTPException(status_code=401, detail="데모 아이디와 비밀번호는 demo / demo 입니다.")
    return {"token": issue_token(body.username.strip()), "user": body.username.strip()}


# ---------------------------------------------------------------- protected
@app.get("/api/me")
def me(user: str = Depends(current_user)):
    return {"user": user}


@app.get("/api/state")
def get_state(_: str = Depends(current_user)):
    return {"state": store.state()}


@app.get("/api/mails")
def get_mails(_: str = Depends(current_user)):
    return {"mails": store.mails()}


@app.post("/api/reset")
def reset(_: str = Depends(current_user)):
    return {"state": store.reset()}


@app.post("/api/modules")
def add_module(body: ModuleIn, _: str = Depends(current_user)):
    return {"state": store.add_module(body.name)}


@app.post("/api/projects")
def create_project(body: ProjectCreate, _: str = Depends(current_user)):
    pid, state = store.create_project(body.name, body.module, body.owner, body.description)
    return {"id": pid, "state": state}


@app.patch("/api/projects/{pid}")
def update_project(pid: str, body: ProjectPatch, _: str = Depends(current_user)):
    return {"state": store.update_project(pid, body.model_dump(exclude_none=True))}


@app.delete("/api/projects/{pid}")
def delete_project(pid: str, _: str = Depends(current_user)):
    return {"state": store.delete_project(pid)}


@app.post("/api/projects/{pid}/tasks")
def create_task(pid: str, body: TaskCreate, _: str = Depends(current_user)):
    tid, state = store.create_task(pid, body.start, body.end, body.name, body.mailId)
    return {"id": tid, "state": state}


@app.patch("/api/tasks/{tid}")
def update_task(tid: str, body: TaskPatch, _: str = Depends(current_user)):
    return {"state": store.update_task(tid, body.model_dump(exclude_none=True))}


@app.delete("/api/tasks/{tid}")
def delete_task(tid: str, _: str = Depends(current_user)):
    return {"state": store.delete_task(tid)}


@app.post("/api/tasks/{tid}/segments")
def create_segment(tid: str, body: SegmentIn, _: str = Depends(current_user)):
    return {"state": store.create_segment(tid, body.start, body.end)}


@app.patch("/api/segments/{sid}")
def update_segment(sid: str, body: SegmentPatch, _: str = Depends(current_user)):
    return {"state": store.update_segment(sid, body.start, body.end)}


@app.delete("/api/segments/{sid}")
def delete_segment(sid: str, _: str = Depends(current_user)):
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
