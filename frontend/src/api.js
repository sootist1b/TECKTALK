// FastAPI 백엔드 호출. 같은 도메인에서 서비스하면 VITE_API_BASE는 비워 둔다.
const BASE = (import.meta.env?.VITE_API_BASE || '').replace(/\/$/, '');
const TOKEN_KEY = 'TT_MEMSCM_TOKEN';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (token) => {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* 저장소를 쓸 수 없는 환경 */ }
};

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(method, path, body) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* 본문 없음 */ }
  if (!res.ok) {
    let detail = data?.detail;
    if (Array.isArray(detail)) detail = '입력값을 확인하세요.';
    throw new ApiError(detail || `요청에 실패했습니다. (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  state: () => request('GET', '/state'),
  mails: () => request('GET', '/mails'),
  reset: () => request('POST', '/reset'),
  addModule: (name) => request('POST', '/modules', { name }),
  createProject: (body) => request('POST', '/projects', body),
  updateProject: (id, body) => request('PATCH', `/projects/${encodeURIComponent(id)}`, body),
  deleteProject: (id) => request('DELETE', `/projects/${encodeURIComponent(id)}`),
  createTask: (pid, body) => request('POST', `/projects/${encodeURIComponent(pid)}/tasks`, body),
  updateTask: (id, body) => request('PATCH', `/tasks/${encodeURIComponent(id)}`, body),
  deleteTask: (id) => request('DELETE', `/tasks/${encodeURIComponent(id)}`),
  createSegment: (tid, body) => request('POST', `/tasks/${encodeURIComponent(tid)}/segments`, body),
  updateSegment: (id, body) => request('PATCH', `/segments/${encodeURIComponent(id)}`, body),
};
