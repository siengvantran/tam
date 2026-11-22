// Staff phone (/sunday-showcases/control): put an act on the big screen, in running order.

import { $, $$, api, formMessage } from './lib.js';

const box = $('#ctl');
const date = box.dataset.date;
let acts = [], current = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const msg = (t) => { $('#ctl-msg').textContent = t; };

async function put(slug) {
  try {
    const r = await api(`/api/showcases/${date}/live`, { method: 'POST', body: { current: slug } });
    current = r.current;
    draw();
    msg(slug ? `On screen: ${(acts.find((a) => a.slug === slug) || {}).name}` : 'On screen: the line-up');
  } catch (e) { msg(e.message); }
}

function draw() {
  $('#ctl-acts').innerHTML = acts.map((a) => `<li><button type="button" class="ctl-act${a.slug === current ? ' on' : ''}" data-slug="${esc(a.slug)}">
    <img src="${esc(a.photo || '/img/christmas/tam-logo-gold.png')}" alt=""><span><b>${esc(a.name)}</b><small>${a.on ? `${esc(a.on)} · ` : ''}act ${a.n}</small></span>${a.slug === current ? '<em>ON SCREEN</em>' : ''}</button></li>`).join('');
  $$('[data-slug]', box).forEach((b) => { b.onclick = () => put(b.dataset.slug); });
}

async function load() {
  let me;
  try { me = await api('/api/staff/me'); } catch { me = null; }
  if (!me) {
    const f = $('#ctl-login'); f.hidden = false;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/staff/link', { method: 'POST', body: { email: f.email.value, next: f.next.value } }); formMessage(f, 'If you’re on TAM’s team, a sign-in link is on its way.', true); } catch (err) { formMessage(f, err.message); }
    });
    return;
  }
  box.hidden = false;
  const S = await api(`/api/showcases/${date}/live`);
  acts = S.acts; current = S.current ? S.current.slug : null;
  // staff see the draft running order's times too
  try {
    const run = await api(`/api/showcases/${date}/run`);
    const order = (run.slots || []).map((x) => x.slug);
    const on = Object.fromEntries((run.slots || []).map((x) => [x.slug, x.on]));
    acts.sort((a, b) => (order.indexOf(a.slug) + 1 || 99) - (order.indexOf(b.slug) + 1 || 99));
    acts.forEach((a) => { a.on = a.on || on[a.slug] || ''; });
  } catch { /* the line-up order will do */ }
  draw();
  $('[data-off]', box).onclick = () => put(null);
  $$('[data-step]', box).forEach((b) => { b.onclick = () => {
    const i = acts.findIndex((a) => a.slug === current);
    const j = Math.max(0, Math.min(acts.length - 1, (i < 0 ? (Number(b.dataset.step) > 0 ? -1 : acts.length) : i) + Number(b.dataset.step)));
    put(acts[j].slug);
  }; });
}
load();

// photos and messages from the audience wait here for a staff OK before the screen shows them
async function queue() {
  if (box.hidden) return;
  try {
    const { items } = await api(`/api/showcases/${date}/live/queue`);
    const name = (slug) => (acts.find((a) => a.slug === slug) || {}).name || slug;
    $('#ctl-qn').textContent = items.length ? `(${items.length})` : '';
    $('#ctl-queue').innerHTML = items.length ? items.map((q) => `<li>${q.kind === 'photo' ? `<img src="${esc(q.src)}" alt="">` : ''}
      <div class="q-text">${q.kind === 'note' ? `“${esc(q.message)}”<small>${esc(q.name)} · for ${esc(name(q.slug))}</small>` : `<small>Photo for ${esc(name(q.slug))}</small>`}</div>
      <button class="btn hot small" type="button" data-q="${esc(q.id)}" data-show="1">Show</button><button class="btn ghost small" type="button" data-q="${esc(q.id)}">Hide</button></li>`).join('') : '<li class="muted small">Nothing waiting.</li>';
    $$('[data-q]', box).forEach((b) => { b.onclick = async () => { b.disabled = true; try { await api(`/api/showcases/${date}/live/queue/${b.dataset.q}`, { method: 'POST', body: { show: Boolean(b.dataset.show) } }); } catch (e) { msg(e.message); } queue(); }; });
  } catch { /* signed out or offline: try again */ }
}
setInterval(queue, 4000); setTimeout(queue, 1500);

// on a computer (the sound desk): arrow keys and L
addEventListener('keydown', (e) => {
  if (box.hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); $('[data-step="1"]', box).click(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); $('[data-step="-1"]', box).click(); }
  else if (e.key === 'l' || e.key === 'L') $('[data-off]', box).click();
});
