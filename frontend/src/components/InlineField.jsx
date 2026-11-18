import React, { useEffect, useRef, useState } from 'react';

/**
 * 기본은 읽기 전용. 더블클릭(또는 포커스 후 Enter)하면 그 필드만 그 자리에서 편집한다.
 * Enter(여러 줄은 Ctrl/⌘+Enter) 또는 포커스 해제 시 저장, Esc는 취소.
 */
export default function InlineField({
  value, kind = 'text', options = [], onSave, hint, long = false,
  className = '', editorClass = 'inline-editor', dataInline,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const finished = useRef(false);

  useEffect(() => {
    if (!editing || !inputRef.current) return;
    inputRef.current.focus();
    if (kind === 'text' || kind === 'textarea') inputRef.current.select();
  }, [editing, kind]);

  const begin = () => {
    finished.current = false;
    setDraft(value ?? '');
    setEditing(true);
  };

  const finish = (cancel, next = draft) => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    if (cancel) return;
    const cleaned = typeof next === 'string' ? next.trim() : next;
    if (cleaned === (value ?? '')) return;
    onSave(cleaned);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(true); }
    else if (e.key === 'Enter' && (kind !== 'textarea' || e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(false); }
  };

  const classes = ['read-field', !value ? 'muted-value' : '', long ? 'long' : '', editing ? 'editing' : '', className]
    .filter(Boolean).join(' ');

  let editor = null;
  if (editing) {
    const common = {
      ref: inputRef, className: editorClass, onKeyDown,
      onBlur: () => finish(false),
      onClick: (e) => e.stopPropagation(),
      onDoubleClick: (e) => e.stopPropagation(),
    };
    if (kind === 'select') {
      editor = (
        <select {...common} value={draft} onChange={(e) => { setDraft(e.target.value); finish(false, e.target.value); }}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    } else if (kind === 'textarea') {
      editor = <textarea {...common} className={`${editorClass} area`} rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />;
    } else {
      editor = (
        <input
          {...common}
          type={kind === 'date' ? 'date' : 'text'}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (kind === 'date' && e.target.value) finish(false, e.target.value); }}
        />
      );
    }
  }

  return (
    <div
      className={classes}
      tabIndex={editing ? -1 : 0}
      role={editing ? undefined : 'button'}
      title="더블클릭하여 편집"
      data-inline={dataInline}
      onDoubleClick={(e) => { e.stopPropagation(); if (!editing) begin(); }}
      onKeyDown={(e) => { if (!editing && e.key === 'Enter') { e.preventDefault(); begin(); } }}
    >
      {editing ? editor : (value || hint || '내용 없음')}
    </div>
  );
}
