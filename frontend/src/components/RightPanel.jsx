import React, { useState } from 'react';
import InlineField from './InlineField.jsx';
import { COLORS, MAIL_MIME, STATUSES, mailListDate, moduleColor } from '../utils.js';

/** 긴 글은 두 줄(메일은 네 줄)까지만 보여 주고 '더보기'로 펼친다. children은 (버튼) => JSX. */
function Clamped({ className, text, limit, children }) {
  const [open, setOpen] = useState(false);
  const toggle = text && text.length > limit ? (
    <button type="button" className="expand-text" aria-expanded={open} aria-label="긴 내용 펼치기" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
      {open ? '접기' : '더보기'}
    </button>
  ) : null;
  return <div className={`${className} ${open ? 'is-expanded' : ''}`}>{children(toggle)}</div>;
}

function Row({ label, extra = '', children }) {
  return (
    <div className={`compact-field-row ${extra}`}>
      <span className="compact-key">{label}</span>
      <div className="compact-value">{children}</div>
    </div>
  );
}

function MailPanel({ mails, selectedMail, onSelectMail }) {
  const mail = mails.find((m) => m.id === selectedMail);
  return (
    <>
      <div className="mail-list-intro">
        <div className="eyebrow">INBOX / DEMO</div>
        <h3>받은 메일 <span className="pill">{mails.length}</span></h3>
        <p className="section-subtext">메일 행을 간트차트 대과제에 드래그해 오늘의 소과제로 등록할 수 있습니다.</p>
      </div>
      <div className="mail-list" role="group" aria-label="받은 메일 목록">
        <div className="mail-list-head" aria-hidden="true"><span>제목</span><span>수신자</span><span>수신일</span><span>첨부파일</span></div>
        {mails.map((m) => (
          <div
            key={m.id}
            className={`mail-row ${selectedMail === m.id ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            draggable
            title={`${m.title} · ${m.recipient} · ${m.at}`}
            onClick={() => onSelectMail(m.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectMail(m.id); } }}
            onDragStart={(e) => {
              e.dataTransfer.setData(MAIL_MIME, m.id);
              e.dataTransfer.setData('text/plain', m.title);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="mail-row-subject">{m.title}</span>
            <span className="mail-row-recipient">{m.recipient}</span>
            <span className="mail-row-date" title={m.at}>{mailListDate(m.at)}</span>
            <span className="mail-row-files">
              {m.attachments?.length
                ? <span className="mail-attach" title={m.attachments.map((a) => a.name).join(' · ')}>♧ {m.attachments.length}</span>
                : <span className="mail-none">—</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="mail-view">
        {mail ? (
          <>
            <div className="eyebrow">MESSAGE PREVIEW</div>
            <h3 style={{ fontSize: 14, margin: '9px 0' }}>{mail.title}</h3>
            <div className="mail-meta">{mail.sender}</div>
            <div className="mail-meta">{mail.at}</div>
            <div className="mail-body">{mail.body}</div>
            {mail.attachments?.length ? (
              <div className="mail-preview-attachments">
                <b>첨부파일</b>
                {mail.attachments.map((a) => <span key={a.name} title="데모에서 첨부파일 다운로드는 지원하지 않습니다.">{a.name}</span>)}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="mail-foot-note">샘플 메일 데이터 · POP3 서버 연동 전</div>
    </>
  );
}

function TaskDetail({ project: p, task: t, modules, onSelectProject, onUpdateTask, onDeleteTask }) {
  const mColor = moduleColor(modules, p.module);
  const save = (field) => (value) => onUpdateTask(p.id, t.id, { [field]: value });
  const hasMail = t.mailContent !== null && t.mailContent !== undefined;
  return (
    <div className="selected-detail compact-panel-detail" key={t.id}>
      <button className="selected-parent-link" type="button" onClick={() => onSelectProject(p.id)}>‹ {p.name}</button>
      <div className="compact-heading">
        <span className="selected-eyebrow">소과제 상세</span>
        <span className="compact-status"><i style={{ background: COLORS[t.status] }} />{t.status}</span>
      </div>
      <div className="compact-fields">
        <div className="task-facts" aria-label="소과제 핵심 정보">
          <div className="task-facts-line task-facts-line--primary">
            <div className="fact-title"><span className="fact-label">소과제명</span><InlineField dataInline="task-name" value={t.name} onSave={save('name')} /></div>
            <div className="fact-status">
              <span className="fact-label">상태</span>
              <span className="inline-dot" style={{ background: COLORS[t.status] }} />
              <InlineField dataInline="task-status" kind="select" options={STATUSES} value={t.status} onSave={save('status')} />
            </div>
          </div>
          <div className="task-facts-line task-facts-line--secondary">
            <div className="fact-dates">
              <span className="fact-label">일정</span>
              <InlineField dataInline="task-start" kind="date" value={t.start} onSave={save('start')} />
              <span className="date-sep">–</span>
              <InlineField dataInline="task-end" kind="date" value={t.end} onSave={save('end')} />
            </div>
            <div className="fact-identities">
              <span className="fact-chip"><i className="inline-dot" style={{ background: mColor }} />{p.module}</span>
              <span className="fact-chip"><i className="inline-dot owner-dot" />{p.owner || 'demo'}</span>
            </div>
          </div>
        </div>
        <Clamped className="compact-field-row compact-clamped" text={t.memo} limit={45}>
          {(toggle) => (
            <>
              <span className="compact-key">내용 메모</span>
              <div className="compact-value">
                <InlineField dataInline="task-memo" kind="textarea" long value={t.memo} hint="더블클릭하여 메모 입력" onSave={save('memo')} />
                {toggle}
              </div>
            </>
          )}
        </Clamped>
      </div>
      {hasMail ? (
        <>
          <div className="compact-section-title">메일내용 <span className="mail-origin-chip">메일에서 등록</span></div>
          {t.mailSource ? <div className="compact-origin" title={t.mailSource.sender}>{t.mailSource.sender} · {t.mailSource.at}</div> : null}
          <Clamped className="compact-mail-content compact-clamped" text={t.mailContent} limit={120}>
            {(toggle) => (
              <>
                <InlineField dataInline="task-mail-content" kind="textarea" long value={t.mailContent} hint="메일 본문 없음" onSave={save('mailContent')} />
                {toggle}
              </>
            )}
          </Clamped>
        </>
      ) : null}
      <div className="compact-foot">
        <span>더블클릭하여 수정</span>
        <button className="btn danger" type="button" onClick={() => onDeleteTask(p, t)}>소과제 삭제</button>
      </div>
    </div>
  );
}

function ProjectDetail({ project: p, modules, onSelectTask, onUpdateProject, onDeleteProject }) {
  const save = (field) => (value) => onUpdateProject(p.id, { [field]: value });
  return (
    <div className="selected-detail compact-panel-detail" key={p.id}>
      <div className="compact-heading"><span className="selected-eyebrow">대과제 상세</span><span className="compact-status">선택한 과제</span></div>
      <div className="compact-fields">
        <Row label="대과제명"><InlineField dataInline="project-name" value={p.name} onSave={save('name')} /></Row>
        <Clamped className="compact-field-row compact-clamped" text={p.description} limit={45}>
          {(toggle) => (
            <>
              <span className="compact-key">대과제내용</span>
              <div className="compact-value">
                <InlineField dataInline="project-description" kind="textarea" long value={p.description} hint="더블클릭하여 내용을 입력하세요" onSave={save('description')} />
                {toggle}
              </div>
            </>
          )}
        </Clamped>
        <Row label="모듈" extra="compact-inline-value">
          <span className="inline-dot" style={{ background: moduleColor(modules, p.module) }} />
          <InlineField dataInline="project-module" kind="select" options={modules.map((m) => m.name)} value={p.module} onSave={save('module')} />
        </Row>
        <Row label="담당자" extra="compact-inline-value"><span className="inline-dot owner-dot" />{p.owner || 'demo'}</Row>
      </div>
      <div className="compact-section-title">소과제 리스트 <span className="pill">{p.tasks.length}개</span></div>
      <div className="compact-tasks">
        {p.tasks.length ? p.tasks.map((x) => (
          <button key={x.id} className="task-card compact-task-card" type="button" title={x.memo || x.name} onClick={() => onSelectTask(p.id, x.id)}>
            <span className="compact-task-name"><i className="inline-dot" style={{ background: COLORS[x.status] }} /><span className="compact-task-title">{x.name}</span></span>
            <span className="compact-task-date">{x.start.slice(5)} ~ {x.end.slice(5)}</span>
          </button>
        )) : <div className="empty-panel compact-empty">등록된 소과제가 없습니다. 간트 빈 셀을 드래그하여 추가하세요.</div>}
      </div>
      <div className="compact-foot">
        <span>더블클릭하여 수정</span>
        <button className="btn danger" type="button" onClick={() => onDeleteProject(p)}>대과제 삭제</button>
      </div>
    </div>
  );
}

export default function RightPanel(props) {
  const { open, mode, projects, selectedProject, selectedTask } = props;
  let content;
  if (mode === 'mail') {
    content = <MailPanel {...props} />;
  } else {
    const p = projects.find((x) => x.id === selectedProject);
    const t = p?.tasks.find((x) => x.id === selectedTask);
    if (!p) {
      content = (
        <div className="selection-empty">
          <span className="selection-empty-icon" aria-hidden="true">▤</span>
          <div className="eyebrow">TASK DETAIL</div>
          <h3>과제를 선택하세요</h3>
          <p>간트차트에서 대과제나 소과제를 클릭하면<br />선택한 과제의 상세 내용이 여기에 표시됩니다.</p>
        </div>
      );
    } else if (t) {
      content = <TaskDetail {...props} project={p} task={t} />;
    } else {
      content = <ProjectDetail {...props} project={p} />;
    }
  }
  return (
    <aside className={`right-panel ${open ? '' : 'hidden'}`} id="rightPanel" aria-label="업무 상세 공용 패널">
      <div className="right-body editor" id="rightBody">{content}</div>
    </aside>
  );
}
