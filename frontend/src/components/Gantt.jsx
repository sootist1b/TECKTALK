import React, { useEffect, useRef, useState } from 'react';
import { COLORS, MAIL_MIME, daysInMonth, iso, moduleColor, visibleRange } from '../utils.js';

const CLICK_DELAY = 225; // 클릭과 더블클릭을 구분하기 위한 지연

function NameEditor({ value, onDone }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (cancel) => {
    if (done.current) return;
    done.current = true;
    onDone(cancel ? null : draft.trim());
  };
  return (
    <input
      ref={ref}
      className="gantt-inline-editor"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(false)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(true); }
        else if (e.key === 'Enter') { e.preventDefault(); finish(false); }
      }}
    />
  );
}

/** 마우스 위치가 몇 일 칸인지 계산한다(행의 첫 날짜 칸 너비 기준). */
function dayFromPoint(x, y, last) {
  const row = document.elementFromPoint(x, y)?.closest('.g-row');
  if (!row || row.classList.contains('header')) return null;
  const first = row.querySelector('.g-day[data-day]');
  if (!first) return null;
  const r = first.getBoundingClientRect();
  const day = Math.floor((x - r.left) / r.width) + 1;
  return day >= 1 && day <= last ? day : null;
}

export default function Gantt({
  year, month, today, projects, modules, openProject, selectedProject, selectedTask,
  onToggleProject, onSelectTask, onRenameProject, onRenameTask,
  onCreateTask, onCreateProject, onResize, onMailDrop,
}) {
  const last = daysInMonth(year, month);
  const [editing, setEditing] = useState(null); // {type:'project'|'task', id}
  const [draft, setDraft] = useState(null); // 드래그 생성 중 {type, pid, a, b}
  const [resize, setResize] = useState(null); // 크기 조절 미리보기 {tid, segId, start, end}
  const [dropHover, setDropHover] = useState(null); // {row, day}
  const clickTimer = useRef(null);
  const drag = useRef(null);
  const handlers = useRef({});
  handlers.current = { onCreateTask, onCreateProject, onResize };

  useEffect(() => () => clearTimeout(clickTimer.current), []);

  // 포인터 기반 드래그 생성 / 크기 조절
  useEffect(() => {
    const move = (e) => {
      const d = drag.current;
      if (!d) return;
      const day = dayFromPoint(e.clientX, e.clientY, last);
      if (day === null) return;
      if (d.kind === 'resize') {
        const value = iso(year, month, day);
        const next = d.edge === 'start' ? { start: value, end: d.span.end } : { start: d.span.start, end: value };
        if (next.start <= next.end) { d.lastDay = day; setResize({ tid: d.tid, segId: d.segId, ...next }); }
        return;
      }
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.g-day[data-create]');
      if (under && under.dataset.create === d.type && (under.dataset.pid || '') === (d.pid || '')) {
        d.end = day;
        setDraft({ type: d.type, pid: d.pid, a: Math.min(d.start, d.end), b: Math.max(d.start, d.end) });
      }
    };
    const up = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      document.body.style.cursor = '';
      setDraft(null);
      if (d.kind === 'create') {
        const a = iso(year, month, Math.min(d.start, d.end));
        const b = iso(year, month, Math.max(d.start, d.end));
        if (d.type === 'project') handlers.current.onCreateProject();
        else handlers.current.onCreateTask(d.pid, a, b);
        return;
      }
      setResize(null);
      if (d.lastDay == null) return;
      handlers.current.onResize({ pid: d.pid, tid: d.tid, segId: d.segId, edge: d.edge, value: iso(year, month, d.lastDay), span: d.span });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [year, month, last]);

  const startCreate = (e, type, pid, day) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { kind: 'create', type, pid, start: day, end: day };
    setDraft({ type, pid, a: day, b: day });
  };

  const startResize = (e, edge, pid, tid, segId, span) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { kind: 'resize', edge, pid, tid, segId, span, lastDay: null };
    document.body.style.cursor = 'ew-resize';
  };

  // 메일 드롭 (대과제와 그 하위 행)
  const dropProps = (rowKey, pid) => ({
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(MAIL_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const day = Number(e.target.closest?.('.g-day')?.dataset.day) || null;
      if (dropHover?.row !== rowKey || dropHover?.day !== day) setDropHover({ row: rowKey, day });
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDropHover((h) => (h?.row === rowKey ? null : h));
    },
    onDrop: (e) => {
      const mailId = e.dataTransfer.getData(MAIL_MIME);
      setDropHover(null);
      if (!mailId) return;
      e.preventDefault();
      onMailDrop(pid, mailId);
    },
  });

  const delayed = (fn) => {
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(fn, CLICK_DELAY);
  };

  const cells = (rowKey, create) => {
    const out = [];
    for (let d = 1; d <= last; d++) {
      const date = iso(year, month, d);
      const dow = new Date(year, month, d).getDay();
      const inDraft = create && draft && draft.type === create.type && (draft.pid || '') === (create.pid || '') && d >= draft.a && d <= draft.b;
      const cls = [
        'g-day',
        dow === 0 || dow === 6 ? 'weekend' : '',
        date === today ? 'today' : '',
        create ? 'create-cell' : '',
        inDraft ? 'drafting' : '',
        dropHover?.row === rowKey && dropHover?.day === d ? 'drop-target' : '',
      ].filter(Boolean).join(' ');
      out.push(
        <div
          key={d}
          className={cls}
          style={{ gridColumn: d + 1 }}
          data-day={d}
          {...(create ? { 'data-create': create.type, 'data-pid': create.pid || '' } : {})}
          onPointerDown={create ? (e) => startCreate(e, create.type, create.pid, d) : undefined}
        />
      );
    }
    return out;
  };

  const bar = (a, b, color, opts) => {
    const range = visibleRange(year, month, a, b);
    if (!range) return null;
    const [s, e] = range;
    const style = { gridColumn: `${s + 1} / ${e + 2}`, background: color, marginLeft: 2, marginRight: 2 };
    if (opts.parent) {
      return (
        <div className={`g-bar parent ${opts.selected ? 'selected' : ''}`} style={style}>
          <span className="bar-label">{opts.label}</span>
        </div>
      );
    }
    return (
      <div
        className={`g-bar ${opts.selected ? 'selected' : ''}`}
        style={style}
        onClick={(ev) => { ev.stopPropagation(); onSelectTask(opts.pid, opts.tid); }}
      >
        <span className="handle start" onPointerDown={(ev) => startResize(ev, 'start', opts.pid, opts.tid, opts.segId, { start: a, end: b })} />
        <span className="handle end" onPointerDown={(ev) => startResize(ev, 'end', opts.pid, opts.tid, opts.segId, { start: a, end: b })} />
      </div>
    );
  };

  const span = (tid, segId, start, end) =>
    resize && resize.tid === tid && (resize.segId || null) === (segId || null) ? [resize.start, resize.end] : [start, end];

  const rows = [];
  for (const p of projects) {
    const color = moduleColor(modules, p.module);
    const chosen = selectedProject === p.id && !selectedTask;
    const open = openProject === p.id;
    const done = p.tasks.filter((t) => t.status === '완료').length;
    const projectKey = `p:${p.id}`;
    rows.push(
      <div
        key={projectKey}
        className={`g-row project ${dropHover?.row === projectKey ? 'is-dropping' : ''}`}
        data-project-row={p.id}
        onClick={() => delayed(() => onToggleProject(p.id))}
        onDoubleClick={(e) => { e.preventDefault(); clearTimeout(clickTimer.current); setEditing({ type: 'project', id: p.id }); }}
        {...dropProps(projectKey, p.id)}
      >
        <div className={`g-label ${chosen ? 'row-selection' : ''}`}>
          <button
            type="button"
            className="expander"
            aria-expanded={open}
            aria-label={`${p.name} 소과제 펼치기/접기`}
            title="소과제 펼치기/접기"
          >{open ? '⌄' : '›'}</button>
          <div className="project-label-stack">
            {editing?.type === 'project' && editing.id === p.id ? (
              <NameEditor
                value={p.name}
                onDone={(name) => { setEditing(null); if (name !== null && name !== p.name) onRenameProject(p.id, name); }}
              />
            ) : (
              <span className={`name main ${chosen ? 'selected-label' : ''}`} title="더블클릭하면 이름을 편집합니다">{p.name}</span>
            )}
            <span className="identity-pair">
              <span className="identity-chip module" title={`모듈: ${p.module}`}><span className="identity-dot" style={{ background: color }} />{p.module}</span>
              <span className="identity-chip owner" title={`담당자: ${p.owner || 'demo'}`}><span className="identity-dot" />{p.owner || 'demo'}</span>
            </span>
          </div>
        </div>
        {cells(projectKey, null)}
        {bar(iso(year, month, 1), iso(year, month, last), color, { parent: true, label: `${done} / ${p.tasks.length}`, selected: chosen })}
      </div>
    );
    if (!open) continue;

    for (const t of p.tasks) {
      const chosenTask = selectedTask === t.id;
      const taskKey = `t:${t.id}`;
      const [s, e] = span(t.id, null, t.start, t.end);
      rows.push(
        <div
          key={taskKey}
          className={`g-row task ${dropHover?.row === taskKey ? 'is-dropping' : ''}`}
          data-task-row={t.id}
          onClick={() => onSelectTask(p.id, t.id)}
          {...dropProps(taskKey, p.id)}
        >
          <div className={`g-label ${chosenTask ? 'row-selection' : ''}`} style={{ paddingLeft: 35 }}>
            <span className="tiny-status" style={{ background: COLORS[t.status] }} />
            {editing?.type === 'task' && editing.id === t.id ? (
              <NameEditor
                value={t.name}
                onDone={(name) => { setEditing(null); if (name !== null && name !== t.name) onRenameTask(p.id, t.id, name); }}
              />
            ) : (
              <span
                className={`name ${chosenTask ? 'selected-label' : ''}`}
                title="한 번 클릭: 과제 상세 · 더블클릭: 이름 수정"
                style={{ cursor: 'text' }}
                onClick={(ev) => { ev.stopPropagation(); delayed(() => onSelectTask(p.id, t.id)); }}
                onDoubleClick={(ev) => { ev.stopPropagation(); clearTimeout(clickTimer.current); setEditing({ type: 'task', id: t.id }); }}
              >{t.name}</span>
            )}
          </div>
          {cells(taskKey, null)}
          {bar(s, e, COLORS[t.status], { pid: p.id, tid: t.id, selected: chosenTask })}
        </div>
      );
      (t.segments || []).forEach((seg, k) => {
        const segKey = `s:${seg.id}`;
        const [ss, se] = span(t.id, seg.id, seg.start, seg.end);
        rows.push(
          <div key={segKey} className={`g-row segment ${dropHover?.row === segKey ? 'is-dropping' : ''}`} {...dropProps(segKey, p.id)}>
            <div className="g-label" style={{ paddingLeft: 52 }}><span className="tiny">↳ 추가 일정 {k + 1}</span></div>
            {cells(segKey, null)}
            {bar(ss, se, COLORS[t.status], { pid: p.id, tid: t.id, segId: seg.id })}
          </div>
        );
      });
    }
    const createKey = `c:${p.id}`;
    rows.push(
      <div key={createKey} className={`g-row create ${dropHover?.row === createKey ? 'is-dropping' : ''}`} {...dropProps(createKey, p.id)}>
        <div className="g-label"><span className="hint-label" style={{ paddingLeft: 22 }}>＋ 빈 행 드래그 · 소과제</span></div>
        {cells(createKey, { type: 'task', pid: p.id })}
      </div>
    );
  }

  const header = [];
  for (let d = 1; d <= last; d++) {
    const dow = new Date(year, month, d).getDay();
    header.push(
      <div key={d} className={`g-day ${dow === 0 || dow === 6 ? 'weekend' : ''} ${iso(year, month, d) === today ? 'today' : ''}`} style={{ gridColumn: d + 1 }}>
        <span>{d}</span>
      </div>
    );
  }

  return (
    <div id="ganttChart" className="gantt-frame">
      <div id="ganttInner" className="gantt-inner" style={{ '--count': last }}>
        <div className="g-row header">
          <div className="g-label"><span className="micro strong muted">TASK / TIMELINE</span></div>
          {header}
        </div>
        {rows}
        <div className="g-row new-project">
          <div className="g-label"><span className="hint-label" style={{ paddingLeft: 8 }}>＋ 빈 행 드래그 · 대과제</span></div>
          {cells('new-project', { type: 'project', pid: '' })}
        </div>
      </div>
    </div>
  );
}
