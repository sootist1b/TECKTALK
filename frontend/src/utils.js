export const COLORS = { '할 일': '#D1D5DB', '진행 중': '#93C5FD', '완료': '#86D9A8' };
export const STATUSES = Object.keys(COLORS);
export const MAIL_MIME = 'application/x-memscm-mail';

export const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const todayIso = () => {
  const n = new Date();
  return iso(n.getFullYear(), n.getMonth(), n.getDate());
};

/** 기간이 해당 월과 겹치면 [시작일, 종료일] (일 단위)을, 아니면 null을 돌려준다. */
export function visibleRange(year, month, a, b) {
  const last = daysInMonth(year, month);
  const start = iso(year, month, 1);
  const end = iso(year, month, last);
  if (!a || !b || b < start || a > end) return null;
  return [a < start ? 1 : Number(a.slice(-2)), b > end ? last : Number(b.slice(-2))];
}

export const moduleColor = (modules, name) => modules.find((m) => m.name === name)?.color || '#D7DEEA';

export function mailListDate(value) {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  if (value?.startsWith('어제')) d.setDate(d.getDate() - 1);
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}
