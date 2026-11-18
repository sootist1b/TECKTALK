import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { COLORS, pad, todayIso } from './utils.js';
import Gantt from './components/Gantt.jsx';
import Matrix from './components/Matrix.jsx';
import RightPanel from './components/RightPanel.jsx';

function Login({ onLogin, busy }) {
  const [id, setId] = useState('demo');
  const [pw, setPw] = useState('demo');
  const submit = () => onLogin(id.trim(), pw);
  return (
    <div className="login" id="login">
      <div className="login-card">
        <div className="mark">T</div>
        <div className="eyebrow" style={{ marginTop: 24 }}>WORK MANAGEMENT SYSTEM</div>
        <h1>TECHTALK_MEMSCM</h1>
        <p className="section-subtext">일정과 업무를 하나의 캔버스에서 관리하세요.</p>
        <label htmlFor="loginId" style={{ fontSize: 12, fontWeight: 700 }}>아이디</label>
        <input id="loginId" className="input" value={id} autoComplete="username" onChange={(e) => setId(e.target.value)} />
        <label htmlFor="loginPassword" style={{ fontSize: 12, fontWeight: 700, display: 'block', marginTop: 15 }}>비밀번호</label>
        <input
          id="loginPassword" className="input" type="password" value={pw} autoComplete="current-password"
          onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button className="btn primary wide" type="button" disabled={busy} onClick={submit}>
          워크스페이스 열기 <span aria-hidden="true">→</span>
        </button>
        <p className="muted small" style={{ marginTop: 22 }}>데모 계정: <b>demo / demo</b><br />데모용 계정이며 서버(FastAPI)에서 확인합니다.</p>
      </div>
    </div>
  );
}

function Modal({ modal, onClose }) {
  if (!modal) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <h3>{modal.title}</h3>
        <p>{modal.description}</p>
        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>취소</button>
          <button className="btn primary" type="button" autoFocus onClick={() => { onClose(); modal.onYes(); }}>확인</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const now = new Date();
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [store, setStore] = useState({ modules: [], projects: [] });
  const [mails, setMails] = useState([]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [owner, setOwner] = useState('demo');
  const [moduleSelection, setModuleSelection] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedMail, setSelectedMail] = useState('mail-1');
  const [openProject, setOpenProject] = useState(null);
  const [mode, setMode] = useState('detail');
  const [panelOpen, setPanelOpen] = useState(true);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('sectionGantt');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const scrollRef = useRef(null);
  const today = todayIso();

  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const logout = useCallback((message) => {
    setToken(null);
    setAuthed(false);
    setSettingsOpen(false);
    if (message) notify(message);
  }, [notify]);

  /** API 호출 → 응답의 전체 상태로 교체. 실패하면 메시지를 띄우고 null을 돌려준다. */
  const run = useCallback(async (call, okMessage) => {
    try {
      const res = await call();
      if (res?.state) setStore(res.state);
      if (okMessage) notify(okMessage);
      return res;
    } catch (e) {
      if (e.status === 401) logout('로그인이 만료되었습니다. 다시 로그인하세요.');
      else notify(e.message);
      return null;
    }
  }, [notify, logout]);

  const enterWorkspace = useCallback(async () => {
    const [s, m] = await Promise.all([api.state(), api.mails()]);
    setStore(s.state);
    setMails(m.mails);
    setOpenProject(null);
    setSelectedProject(null);
    setSelectedTask(null);
    setAuthed(true);
    setSidebarCompact(panelOpen);
  }, [panelOpen]);

  // 저장된 토큰이 유효하면 로그인 화면을 건너뛴다.
  useEffect(() => {
    if (!getToken()) return;
    enterWorkspace().catch(() => setToken(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (id, pw) => {
    setBusy(true);
    try {
      const res = await api.login(id, pw);
      setToken(res.token);
      await enterWorkspace();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------ 레이아웃
  const showPanel = (m) => { setMode(m); setPanelOpen(true); setSidebarCompact(true); };
  const togglePanel = () => { const next = !panelOpen; setPanelOpen(next); setSidebarCompact(next); };

  const goSection = (id) => {
    const node = document.getElementById(id);
    const viewport = scrollRef.current;
    if (node && viewport) {
      const top = node.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - 30;
      viewport.scrollTo({ top, behavior: 'smooth' });
    }
    setActiveSection(id);
  };

  useEffect(() => {
    if (!settingsOpen && !pickerOpen) return undefined;
    const close = (e) => {
      if (settingsOpen && !e.target.closest('#settingsPop') && !e.target.closest('[title="설정"]')) setSettingsOpen(false);
      if (pickerOpen && !e.target.closest('#modulePicker') && !e.target.closest('.filter-multi')) setPickerOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [settingsOpen, pickerOpen]);

  useEffect(() => {
    if (!authed) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { setSettingsOpen(false); setPickerOpen(false); return; }
      if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        goSection('sectionGantt');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [authed]);

  // ------------------------------------------------------------ 필터 / 월 이동
  const visibleProjects = useMemo(
    () => store.projects.filter((p) => (owner === 'all' || (p.owner || 'demo') === owner)
      && (moduleSelection.length === 0 || moduleSelection.includes(p.module))),
    [store.projects, owner, moduleSelection],
  );
  const owners = useMemo(() => [...new Set(store.projects.map((p) => p.owner || 'demo'))], [store.projects]);

  const monthChange = (n) => { const d = new Date(year, month + n, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); };
  const todayMonth = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  // ------------------------------------------------------------ 선택
  const selectProject = (id) => { setSelectedProject(id); setSelectedTask(null); showPanel('detail'); };
  const selectTask = (pid, tid) => { setSelectedProject(pid); setSelectedTask(tid); setOpenProject(pid); showPanel('detail'); };
  const toggleChartProject = (id) => {
    setOpenProject((cur) => (cur === id ? null : id));
    setSelectedProject(id);
    setSelectedTask(null);
    showPanel('detail');
  };

  // ------------------------------------------------------------ 변경
  const updateProject = (pid, changes) => run(() => api.updateProject(pid, changes));
  const updateTask = (pid, tid, changes) => {
    const t = store.projects.find((p) => p.id === pid)?.tasks.find((x) => x.id === tid);
    if (t && ((changes.start && changes.start > t.end) || (changes.end && changes.end < t.start))) {
      notify('종료일보다 늦게 시작하거나 시작일보다 일찍 끝날 수 없습니다.');
      return null;
    }
    return run(() => api.updateTask(tid, changes));
  };

  const createProject = async () => {
    const module = moduleSelection.length === 1 ? moduleSelection[0] : '공통';
    const res = await run(() => api.createProject({ name: '새 대과제', module, owner: 'demo' }), '대과제가 생성되었습니다. 우측 패널에서 이름을 수정하세요.');
    if (res) { setSelectedProject(res.id); setSelectedTask(null); showPanel('detail'); }
  };

  const createTask = async (pid, start, end, mailId) => {
    const res = await run(
      () => api.createTask(pid, { start, end, ...(mailId ? { mailId } : {}) }),
      mailId ? '메일에서 오늘 날짜로 소과제를 생성했습니다.' : '드래그한 기간에 소과제를 생성했습니다.',
    );
    if (!res) return;
    setOpenProject(pid);
    setSelectedProject(pid);
    setSelectedTask(res.id);
    if (mailId && (year !== now.getFullYear() || month !== now.getMonth())) todayMonth();
    showPanel('detail');
  };

  const resizeBar = async ({ tid, segId, edge, value, span }) => {
    if ((edge === 'start' && value > span.end) || (edge === 'end' && value < span.start)) {
      notify('시작일은 종료일 이전이어야 합니다.');
      return;
    }
    const body = { [edge]: value };
    await run(() => (segId ? api.updateSegment(segId, body) : api.updateTask(tid, body)), '간트 일정이 변경되었습니다.');
  };

  const deleteProject = (p) => setModal({
    title: '대과제 삭제',
    description: `「${p.name}」와 모든 소과제/추가 일정이 삭제됩니다.`,
    onYes: async () => {
      const res = await run(() => api.deleteProject(p.id), '대과제 삭제됨');
      if (res) { setSelectedProject(res.state.projects[0]?.id || null); setSelectedTask(null); }
    },
  });

  const deleteTask = (p, t) => setModal({
    title: '소과제 삭제',
    description: `「${t.name}」와 추가 일정 구간을 삭제할까요?`,
    onYes: async () => {
      const res = await run(() => api.deleteTask(t.id), '소과제 삭제됨');
      if (res) setSelectedTask(null);
    },
  });

  const addModule = async () => {
    setSettingsOpen(false);
    const name = window.prompt('추가할 모듈 이름을 입력하세요.')?.trim();
    if (!name) return;
    if (store.modules.some((m) => m.name.toLowerCase() === name.toLowerCase())) { notify('이미 존재하는 모듈입니다.'); return; }
    await run(() => api.addModule(name), `${name} 모듈 추가됨`);
  };

  const resetDemo = () => {
    setSettingsOpen(false);
    setModal({
      title: '데모 초기화',
      description: '추가/수정한 모든 데모 데이터를 초기 상태로 되돌릴까요?',
      onYes: async () => {
        const res = await run(() => api.reset(), '데모 데이터가 초기화되었습니다.');
        if (res) {
          setModuleSelection([]); setOwner('demo'); setSelectedProject(null); setSelectedTask(null); setOpenProject(null);
        }
      },
    });
  };

  const confirmLogout = () => setModal({ title: '로그아웃', description: '데모 워크스페이스에서 로그아웃할까요?', onYes: () => logout() });

  // ------------------------------------------------------------ 매트릭스 필터
  const resetMatrixView = () => { setOwner('all'); setModuleSelection([]); };
  const matrixOwner = (who) => setOwner((cur) => (cur === who ? 'all' : who));
  const matrixModule = (name) => setModuleSelection((cur) => (cur.length === 1 && cur[0] === name ? [] : [name]));
  const matrixCell = (who, name) => {
    if (owner === who && moduleSelection.length === 1 && moduleSelection[0] === name) { setOwner('all'); setModuleSelection([]); }
    else { setOwner(who); setModuleSelection([name]); }
  };

  // ------------------------------------------------------------ 렌더
  const toastNode = toast ? <div className="toast">{toast}</div> : null;
  if (!authed) return <>{<Login onLogin={login} busy={busy} />}{toastNode}</>;

  const taskCount = visibleProjects.reduce((n, p) => n + p.tasks.length, 0);

  return (
    <>
      <div className="app" id="app">
        <aside className={`sidebar ${sidebarCompact ? 'compact' : ''}`} id="rail">
          <div className="logo rail-brand">
            <button
              type="button"
              className="brand-mark rail-icon-toggle"
              title={sidebarCompact ? '왼쪽 아이콘 클릭 · 사이드바 펼치기' : '사이드바 접기'}
              aria-label="왼쪽 사이드바 펼치기 또는 접기"
              aria-expanded={!sidebarCompact}
              onClick={() => setSidebarCompact(!sidebarCompact)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 3v18" /><path d="M6 8h0M6 12h0" />
              </svg>
            </button>
            <div><div className="product">TECHTALK_MEMSCM</div><div className="subtitle">ENGINEERING WORKSPACE</div></div>
          </div>
          <div className="rail-index">
            <div className="toc-group">
              <div className="sidebar-heading">WORKSPACE / 01</div>
              <button type="button" className="toc-parent active" onClick={() => (sidebarCompact ? setSidebarCompact(false) : goSection('sectionGantt'))}>
                <span className="rail-n">01</span><span>일정</span><span className="toc-active-marker">●</span>
              </button>
              <div className="toc-children" aria-label="일정 화면 내 목차">
                {[['sectionGantt', '01.1', '간트차트'], ['sectionMatrix', '01.2', '매트릭스 표']].map(([id, n, label]) => (
                  <button key={id} type="button" className={`toc-item ${activeSection === id ? 'active' : ''}`} onClick={() => goSection(id)}>
                    <span className="toc-n">{n}</span><span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="sidebar-heading" style={{ marginTop: 18 }}>MODULES</div>
            <div className="rail-modules">
              {store.modules.map((m) => <span key={m.name} className="rail-module"><i style={{ background: m.color }} />{m.name}</span>)}
            </div>
          </div>
          <div className="side-bottom">
            <div className="micro upper muted" style={{ fontWeight: 700, letterSpacing: '.12em' }}>WORKSPACE</div>
            <div className="side-page" style={{ justifyContent: 'flex-start', gap: 10 }}>
              <span className="pill blue">일정 · 단일 화면</span><span className="micro muted tabular">01 / 01</span>
            </div>
            <div className="rail-shortcut">간트차트와 일정 매트릭스를 한 화면에서 관리합니다.</div>
          </div>
        </aside>

        <div className="shell">
          <div className="main-column">
            <header className="topbar">
              <div className="crumb"><span className="crumb-brand">WORKSPACE</span><span className="crumb-sep">/</span><strong>일정 / 업무 통합 화면</strong></div>
              <div className="top-actions">
                <span className="demo-label">DEMO MODE</span>
                <button type="button" className="btn tool-link" title="메일함" aria-label="메일함" onClick={() => showPanel('mail')}>✉ <span className="tool-word">메일함</span></button>
                <button type="button" className="btn tool-link" title="과제 상세" aria-label="과제 상세" onClick={() => showPanel('detail')}>▤ <span className="tool-word">상세</span></button>
                <button type="button" className="btn tool-link icon-only" title="패널 열기/닫기" aria-label="패널 열기/닫기" onClick={togglePanel}>◧</button>
                <span className="tool-separator" />
                <button type="button" className="btn tool-link icon-only" title="설정" aria-label="설정" onClick={() => setSettingsOpen((v) => !v)}>⚙</button>
                <button type="button" className="btn tool-link icon-only" title="로그아웃" aria-label="로그아웃" onClick={confirmLogout}>⇥</button>
              </div>
            </header>

            <div className="body-shell">
              <div className="main-scroll" id="mainScroll" ref={scrollRef}>
                <main className="paper" id="paper">
                  <section id="sectionGantt" className="single-section">
                    <div className="gantt-only-heading">
                      <div>
                        <div className="eyebrow">SCHEDULE / MONTHLY</div>
                        <h1 className="page-h1">간트차트 <span className="gantt-slash">/</span> 매트릭스</h1>
                      </div>
                      <div className="legend compact-legend">
                        {Object.entries(COLORS).map(([name, color]) => (
                          <div key={name} className="legend-item"><span className="legend-swatch" style={{ background: color }} />{name}</div>
                        ))}
                      </div>
                    </div>
                    <div className="controls">
                      <div className="controls-left">
                        <button type="button" className="btn square" aria-label="이전 달" onClick={() => monthChange(-1)}>‹</button>
                        <span className="strong tabular" style={{ minWidth: 105, textAlign: 'center', fontSize: 14 }}>{year}. {pad(month + 1)}</span>
                        <button type="button" className="btn square" aria-label="다음 달" onClick={() => monthChange(1)}>›</button>
                        <button type="button" className="btn" onClick={todayMonth}>오늘</button>
                      </div>
                      <div className="controls-right">
                        <span className="control-label">담당자</span>
                        <select className="select" aria-label="담당자 필터" value={owner} onChange={(e) => setOwner(e.target.value)}>
                          <option value="all">전체 담당자</option>
                          {owners.map((w) => <option key={w} value={w}>{w}</option>)}
                          {owner !== 'all' && !owners.includes(owner) ? <option value={owner}>{owner}</option> : null}
                        </select>
                        <span className="control-label">모듈</span>
                        <select
                          className="select"
                          aria-label="모듈 필터"
                          value={moduleSelection.length === 1 ? moduleSelection[0] : 'all'}
                          onChange={(e) => setModuleSelection(e.target.value === 'all' ? [] : [e.target.value])}
                        >
                          <option value="all">전체 모듈</option>
                          {store.modules.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                        </select>
                        <button type="button" className="btn filter-multi" onClick={() => setPickerOpen((v) => !v)}>
                          다중 선택 <span>{moduleSelection.length ? `(${moduleSelection.length})` : ''}</span>
                        </button>
                        {pickerOpen ? (
                          <div className="module-picker" id="modulePicker">
                            <div className="picker-title">모듈 필터 <span>복수 선택 가능</span></div>
                            <div className="picker-options">
                              {store.modules.map((m) => (
                                <label key={m.name} className="picker-opt">
                                  <input
                                    type="checkbox"
                                    checked={moduleSelection.includes(m.name)}
                                    onChange={(e) => setModuleSelection((cur) => (e.target.checked ? [...new Set([...cur, m.name])] : cur.filter((x) => x !== m.name)))}
                                  />
                                  <i style={{ background: m.color }} />{m.name}
                                </label>
                              ))}
                            </div>
                            <div className="picker-actions">
                              <button type="button" className="btn" onClick={() => setModuleSelection([])}>전체 보기</button>
                              <button type="button" className="btn primary" onClick={() => setPickerOpen(false)}>적용</button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <Gantt
                      year={year}
                      month={month}
                      today={today}
                      projects={visibleProjects}
                      modules={store.modules}
                      openProject={openProject}
                      selectedProject={selectedProject}
                      selectedTask={selectedTask}
                      onToggleProject={toggleChartProject}
                      onSelectTask={selectTask}
                      onRenameProject={(pid, name) => updateProject(pid, { name })}
                      onRenameTask={(pid, tid, name) => updateTask(pid, tid, { name })}
                      onCreateTask={(pid, a, b) => createTask(pid, a, b, null)}
                      onCreateProject={createProject}
                      onResize={resizeBar}
                      onMailDrop={(pid, mailId) => createTask(pid, today, today, mailId)}
                    />
                    <div className="chart-meta">
                      <span>대과제 클릭: 접기/펼치기 · 더블클릭: 인라인 편집 · 빈 셀 드래그: 생성</span>
                      <span className="tabular">{visibleProjects.length} 대과제 · {taskCount} 소과제</span>
                    </div>
                  </section>
                  <section id="sectionMatrix" className="mx-section">
                    <Matrix
                      projects={store.projects}
                      modules={store.modules}
                      owner={owner}
                      moduleSelection={moduleSelection}
                      onReset={resetMatrixView}
                      onOwner={matrixOwner}
                      onModule={matrixModule}
                      onCell={matrixCell}
                    />
                  </section>
                </main>
              </div>
            </div>

            <footer className="footer">
              <div className="footer-work"><span className="footer-online" /> TECHTALK_MEMSCM <span className="footer-sep">/</span> 통합 일정 워크스페이스</div>
              <div className="pager-center">
                <div className="pager-top"><span className="tabular"><b>01</b> / <span>01</span></span><span className="next-hint">월간 일정</span></div>
                <div className="pager-track"><div className="pager-fill" style={{ width: '100%' }} /></div>
              </div>
            </footer>
          </div>

          <RightPanel
            open={panelOpen}
            mode={mode}
            projects={store.projects}
            modules={store.modules}
            mails={mails}
            selectedProject={selectedProject}
            selectedTask={selectedTask}
            selectedMail={selectedMail}
            onSelectMail={setSelectedMail}
            onSelectProject={selectProject}
            onSelectTask={selectTask}
            onUpdateProject={updateProject}
            onUpdateTask={updateTask}
            onDeleteProject={deleteProject}
            onDeleteTask={deleteTask}
          />
        </div>
      </div>

      {settingsOpen ? (
        <div className="setting-pop" id="settingsPop">
          <div className="micro upper muted" style={{ padding: '7px 12px', fontWeight: 800 }}>Preferences</div>
          <button type="button" onClick={addModule}>＋ 모듈 추가</button>
          <button type="button" onClick={resetDemo}>↺ 데모 데이터 초기화</button>
          <button type="button" onClick={() => { setSettingsOpen(false); notify('로그인 방법과 SSO 설정은 정식 서버 구현 단계에서 연결합니다.'); }}>⚙ 계정 및 보안 (준비 중)</button>
        </div>
      ) : null}
      <Modal modal={modal} onClose={() => setModal(null)} />
      {toastNode}
    </>
  );
}
