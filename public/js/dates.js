// Timezone-safe ISO (YYYY-MM-DD) date helpers. Calendar math goes through Date.UTC only.
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function toUtc(iso) {
  if (typeof iso !== 'string') return null;
  const m = ISO_RE.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const c = new Date(t);
  if (c.getUTCFullYear() !== y || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d) return null;
  return t;
}

export function todayIso(now = new Date()) {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

export function isIsoDate(str) {
  return toUtc(str) !== null;
}

export function addDays(iso, n) {
  const t = toUtc(iso);
  if (t === null || !Number.isInteger(n)) return '';
  const c = new Date(t + n * 86400000);
  return `${pad(c.getUTCFullYear(), 4)}-${pad(c.getUTCMonth() + 1, 2)}-${pad(c.getUTCDate(), 2)}`;
}

export function parseNetTerms(text) {
  if (typeof text !== 'string') return null;
  const m = /net\s*(\d+)/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

export function compareIso(a, b) {
  if (!isIsoDate(a) || !isIsoDate(b)) return 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatDate(iso, locale) {
  const t = toUtc(iso);
  if (t === null) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(t);
}
