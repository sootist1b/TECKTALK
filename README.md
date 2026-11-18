# TECHTALK_MEMSCM — 통합 일정 워크스페이스

간트차트, 담당자 × 모듈 매트릭스, 메일 → 소과제 등록을 한 화면에서 다루는 업무 관리 도구입니다.
단일 HTML 시제품(`prototype/`)을 **React(Vite) + FastAPI + SQLite** 구조로 옮긴 버전입니다.

## 구조

```
frontend/            React 앱 (Vite)
  src/App.jsx        화면 전체 상태·레이아웃(사이드바, 상단바, 필터, 모달, 토스트)
  src/components/    Gantt, Matrix, RightPanel(상세/메일함), InlineField(더블클릭 편집)
  src/api.js         FastAPI 호출
  src/styles.css     시제품 스타일 그대로
backend/
  app/main.py        FastAPI 라우트 + 빌드된 React 앱 제공
  app/store.py       SQLite 저장소와 업무 규칙(검증, 시드 데이터)
  app/auth.py        데모 로그인 토큰(HMAC 서명)
prototype/           원본 단일 HTML 시제품
Dockerfile           React 빌드 → FastAPI 이미지 (서비스 1개로 배포)
render.yaml          Render 배포 설정
```

## 로컬 실행

```bash
# 1) 백엔드 (http://localhost:8000)
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# 2) 프론트엔드 (http://localhost:5173, /api는 8000번으로 프록시)
cd frontend
npm install
npm run dev
```

데모 계정은 `demo / demo`입니다. 데이터는 `backend/data/memscm.db`(SQLite)에 저장됩니다.

Docker 하나로 실행하려면:

```bash
docker build -t memscm .
docker run -p 8000:8000 memscm      # http://localhost:8000
```

## 온라인 배포 (Render, 무료 플랜)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sootist1b/TECKTALK)

1. 위 버튼을 누르고 Render에 GitHub 계정으로 로그인합니다.
2. `render.yaml` 설정이 그대로 뜨면 **Apply**를 누릅니다.
3. 빌드가 끝나면 `https://techtalk-memscm.onrender.com` 같은 주소가 생깁니다.

이후 `main` 브랜치에 푸시하면 자동으로 다시 배포됩니다.

> 무료 플랜 주의: 15분간 접속이 없으면 서버가 잠들어 첫 접속이 30초~1분 걸리고,
> 재배포·재시작 때 SQLite 데이터가 초기화됩니다. 데이터를 유지하려면 유료 플랜의 Persistent Disk를
> `/app/data`에 연결하거나, 외부 DB(PostgreSQL 등)로 옮겨야 합니다.

### 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `SECRET_KEY` | 실행 때마다 무작위 | 로그인 토큰 서명 키. 배포 시 고정값 권장(Render가 자동 생성) |
| `DEMO_USER` / `DEMO_PASSWORD` | `demo` / `demo` | 로그인 계정 |
| `DATABASE_PATH` | `backend/data/memscm.db` | SQLite 파일 위치 |
| `TZ_OFFSET_HOURS` | `9` | 시드 데이터·메일 등록 시 '오늘' 기준 시간대 |
| `ALLOWED_ORIGINS` | (없음) | 프론트를 다른 도메인에 따로 올릴 때 CORS 허용 목록(쉼표 구분) |
| `VITE_API_BASE` | (없음) | 프론트 빌드 시 API 주소. 같은 도메인이면 비워 둠 |

## API 요약

로그인 외 모든 요청은 `Authorization: Bearer <token>`이 필요합니다. 변경 요청은 갱신된 전체 상태 `{ "state": {...} }`를 돌려줍니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/login` | 로그인 → `{token}` |
| GET | `/api/state` | 모듈 + 대과제/소과제/추가 일정 전체 |
| GET | `/api/mails` | 샘플 메일 |
| POST | `/api/reset` | 데모 데이터 초기화 |
| POST | `/api/modules` | 모듈 추가 |
| POST / PATCH / DELETE | `/api/projects[/{id}]` | 대과제 생성·수정·삭제 |
| POST | `/api/projects/{id}/tasks` | 소과제 생성 (`mailId`를 주면 메일 내용으로 오늘 날짜에 생성) |
| PATCH / DELETE | `/api/tasks/{id}` | 소과제 수정·삭제 |
| POST | `/api/tasks/{id}/segments` | 소과제에 추가 일정 구간 추가 |
| PATCH / DELETE | `/api/segments/{id}` | 추가 일정 구간 수정·삭제 |

FastAPI 자동 문서는 `/docs`에서 볼 수 있습니다.
