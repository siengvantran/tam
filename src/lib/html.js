// Tiny HTML templating: interpolations are escaped unless wrapped in raw().

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new Raw(String(s ?? ''));

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (v instanceof Raw) return v.s;
  return esc(v);
}

export function h(strings, ...vals) {
  return raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? render(vals[i]) : ''), ''));
}

const TZ = 'Europe/London';
export const fmtDate = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(new Date(iso));
export const fmtTime = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const fmtDuration = (iso) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(iso || '');
  if (!m) return '';
  return [m[1] && `${m[1]}h`, m[2] && `${m[2]}m`].filter(Boolean).join(' ');
};
