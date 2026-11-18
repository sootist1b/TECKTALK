import React from 'react';

/** 담당자 × 모듈 교차 매트릭스. 간트 필터와 무관하게 항상 전체 대과제 기준으로 집계한다. */
export default function Matrix({ projects, modules, owner, moduleSelection, onReset, onOwner, onModule, onCell }) {
  const owners = [...new Set([owner === 'all' ? 'demo' : owner, ...projects.map((p) => p.owner || 'demo')])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const single = moduleSelection.length === 1 ? moduleSelection[0] : null;
  const ownerLabel = owner === 'all' ? '전체 담당자' : owner;
  const moduleLabel = moduleSelection.length === 0 ? '전체 모듈' : moduleSelection.join(', ');

  return (
    <>
      <div className="mx-section-head">
        <h2>담당자 × 모듈 매트릭스</h2>
        <span className="mx-help">필터: {ownerLabel} · {moduleLabel}</span>
      </div>
      <div className="mx-summary-wrap">
        <table className="mx-summary" aria-label="담당자별 모듈 소과제 완료 현황">
          <thead>
            <tr>
              <th scope="col">
                <button type="button" className="mx-matrix-btn mx-header-btn" title="전체 담당자·모듈 보기" onClick={onReset}>담당자 ↓ / 모듈 →</button>
              </th>
              {modules.map((m) => (
                <th scope="col" key={m.name}>
                  <button
                    type="button"
                    className={`mx-matrix-btn mx-header-btn ${single === m.name ? 'is-active' : ''}`}
                    title={`${m.name} 모듈로 간트차트 필터`}
                    onClick={() => onModule(m.name)}
                  >
                    <i className="mx-matrix-dot" style={{ background: m.color }} />{m.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {owners.map((who) => (
              <tr key={who}>
                <th scope="row">
                  <button
                    type="button"
                    className={`mx-matrix-btn mx-row-btn ${owner === who ? 'is-active' : ''}`}
                    title={`${who} 담당자만 보기`}
                    onClick={() => onOwner(who)}
                  >
                    <i className="mx-matrix-dot" style={{ background: '#2E3AAF' }} />{who}
                  </button>
                </th>
                {modules.map((m) => {
                  const tasks = projects.filter((p) => (p.owner || 'demo') === who && p.module === m.name).flatMap((p) => p.tasks);
                  const total = tasks.length;
                  const done = tasks.filter((t) => t.status === '완료').length;
                  const active = owner === who && single === m.name;
                  return (
                    <td key={m.name}>
                      <button
                        type="button"
                        className={`mx-matrix-btn cell ${active ? 'is-active' : ''} ${total ? '' : 'no-data'}`}
                        title={`${who} × ${m.name}: 완료 ${done}건, 전체 ${total}건. 클릭하면 간트 필터`}
                        onClick={() => onCell(who, m.name)}
                      >
                        <span className="mx-main-count">{total ? `${done}/${total}` : '0/0'}</span>
                        <span className="mx-cell-rate">{total ? `(${Math.round((done / total) * 100)}%)` : '(—)'}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mx-matrix-note">
        <span>완료건수/전체건수 (완료율) · 0건인 셀은 — 표시</span>
        <button type="button" className="mx-clear" onClick={onReset}>전체 보기 ↗</button>
      </div>
    </>
  );
}
