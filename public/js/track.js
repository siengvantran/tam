// How visitors react to a Sunday Showcase act. Each reaction is counted on
// TAM's own server (totals only: no cookies, nothing about who you are) for
// the running order in the back office, and is also sent to Google Analytics
// when the visitor has said yes to its cookies (public/js/consent.js).
//
// base: "/api/showcases/<date>/act/<slug>"; type: view | invite | follow | play | unwrap.

export function signal(base, type, extra = {}) {
  if (!base) return;
  const slug = base.split('/').pop(), date = base.split('/')[3];
  try {
    fetch(`${base}/signal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type }), keepalive: true }).catch(() => {});
  } catch { /* offline */ }
  if (window.tamTrack) window.tamTrack(`showcase_${type}`, { act: slug, showcase_date: date, ...extra });
}

// Once per visit for things like a page view, so a reload doesn't count twice.
export function signalOnce(base, type, extra) {
  const k = `tam:sig:${base}:${type}`;
  try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch { /* private mode */ }
  signal(base, type, extra);
}
