// Ask TAM in the browser: the floating drawer and any inline chat panel.
// Streams the agent's progress (server-sent events over fetch), renders its
// reply and the cards its tools found, and keeps the conversation for this tab.
// Also: pathway enquiry forms and "Not you? Choose again".

import { $, $$, api, formMessage } from './lib.js';

const KEY = 'tam:chat';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || []; } catch { return []; } };
const keep = (h) => { try { sessionStorage.setItem(KEY, JSON.stringify(h.slice(-30))); } catch { /* private mode */ } };
const sameSite = (u) => /^\/(?!\/)[\w\-/.?=&#%]*$/.test(u);

// Escape, then allow **bold** and [label](/path) links to TAM's own pages only.
function rich(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => (sameSite(url.replace(/&amp;/g, '&')) ? `<a href="${url}">${label}</a>` : label))
    .split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

function card(c) {
  const link = (u) => (sameSite(u) ? u : '#');
  if (c.type === 'night') return `<a class="ccard" href="${link(c.url)}"><b>${esc(c.title)}</b><span>${esc(c.date)} · ${esc(c.times)}</span><span class="cprice">${c.from ? `From ${esc(c.from)}` : 'Details'}${c.left !== null && c.left !== undefined && c.left < 40 ? ` · ${c.left} left` : ''}</span></a>`;
  if (c.type === 'artist') return `<a class="ccard artist" href="${link(c.url)}">${c.photo ? `<img src="${esc(c.photo)}" alt="">` : ''}<b>${esc(c.name)}</b><span>${esc(c.role)}</span></a>`;
  if (c.type === 'book') return `<a class="ccard book" href="${link(c.url)}"><b>${esc(c.title)}</b><span>${esc(c.sub)}</span><span class="cprice">${esc(c.total)}${c.deal ? ` · ${esc(c.deal)}` : ''}</span><span class="cgo">Book now →</span></a>`;
  if (c.type === 'done') return `<div class="ccard done"><b>✓ ${esc(c.title)}</b><span>${esc(c.sub)}</span></div>`;
  return `<a class="ccard link" href="${link(c.url)}"><b>${esc(c.title)}</b>${c.sub ? `<span>${esc(c.sub)}</span>` : ''}</a>`;
}

const pathwayCookie = () => (/(?:^|;\s*)tam_path=([a-z0-9-]+)/.exec(document.cookie) || [])[1] || '';

function mount(root) {
  const log = $('.chat-log', root), form = $('.chat-form', root), input = $('textarea', form), suggest = $('.chat-suggest', root);
  let busy = false;

  function render() {
    const h = load();
    log.innerHTML = h.map((m) => `<div class="cmsg ${m.role}">${m.role === 'user' ? `<p>${esc(m.text)}</p>` : rich(m.text || '')}${(m.cards || []).length ? `<div class="ccards">${m.cards.map(card).join('')}</div>` : ''}</div>`).join('');
    suggest.hidden = h.length > 0;
    log.scrollTop = log.scrollHeight;
  }

  async function ask(q) {
    q = q.trim();
    if (!q || busy) return;
    busy = true;
    const h = load();
    h.push({ role: 'user', text: q });
    const reply = { role: 'assistant', text: '', cards: [] };
    h.push(reply);
    keep(h); render();
    const bubble = log.lastElementChild;
    bubble.innerHTML = '<p class="cstatus"><i></i>Thinking…</p>';
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    try {
      const res = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ history: h.slice(0, -1).map(({ role, text }) => ({ role, text })), pathway: root.dataset.pathway || pathwayCookie(), page: location.pathname }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ask TAM is busy. Try again in a moment.');
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = (/^event: (.+)$/m.exec(chunk) || [])[1];
          let data = {};
          try { data = JSON.parse((/^data: (.*)$/m.exec(chunk) || [])[1] || '{}'); } catch { continue; }
          if (ev === 'status') bubble.innerHTML = `<p class="cstatus"><i></i>${esc(data.text)}</p>${reply.cards.length ? `<div class="ccards">${reply.cards.map(card).join('')}</div>` : ''}`;
          if (ev === 'cards') { reply.cards.push(...data.items); reply.cards = reply.cards.filter((c, k, a) => a.findIndex((x) => x.url === c.url && x.type === c.type) === k).slice(-8); }
          if (ev === 'text') reply.text = data.text;
          if (ev === 'error') reply.text = data.message;
        }
      }
    } catch (e) {
      reply.text = e.message;
    }
    if (!reply.text) reply.text = 'Sorry, I lost my thread. Try asking again.';
    keep(h); render();
    busy = false; btn.disabled = false;
    // keep other panels on the page in step
    for (const other of panels) if (other !== api_) other.render();
  }
  const api_ = { render, ask };

  form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value; input.value = ''; ask(q); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  root.addEventListener('click', (e) => {
    const s = e.target.closest('[data-ask]');
    if (s) ask(s.dataset.ask);
    if (e.target.closest('[data-chat-clear]')) { keep([]); panels.forEach((p) => p.render()); }
  });
  render();
  return api_;
}

const panels = $$('.chat').map(mount);

// ----- the floating drawer -----
const fab = $('#ask-open'), drawer = $('#ask-drawer');
if (fab && drawer) {
  const open = (state) => {
    drawer.hidden = !state; fab.setAttribute('aria-expanded', String(state));
    document.body.classList.toggle('ask-on', state);
    if (state) { $('textarea', drawer).focus(); const l = $('.chat-log', drawer); l.scrollTop = l.scrollHeight; }
  };
  // With an inline panel on a wide page, the button takes you to it instead.
  const inline = $('.chat[data-chat="home"], .chat[data-chat="page"]');
  if (inline) document.body.classList.add('has-inline-chat');
  fab.addEventListener('click', () => {
    if (inline && innerWidth > 900) { inline.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('textarea', inline).focus(); return; }
    open(drawer.hidden);
  });
  $('#ask-close').addEventListener('click', () => open(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) open(false); });
}

// ----- pathway enquiry forms -----
const ef = $('#enquiry-form');
if (ef) {
  ef.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', ef);
    btn.disabled = true;
    try {
      const r = await api('/api/enquiries', { method: 'POST', body: { ...Object.fromEntries(new FormData(ef)), kind: ef.dataset.kind, pathway: ef.dataset.pathway } });
      formMessage(ef, `Thank you. Your reference is ${r.id}. We’ll reply by email, usually within two working days.`, true);
      ef.reset();
    } catch (err) { formMessage(ef, err.message); }
    btn.disabled = false;
  });
}

// ----- "Not you? Choose again" -----
document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-forget-path]')) return;
  await fetch('/for/forget', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  location.href = '/';
});
