// /food/partners: page through the slides (arrows, keys, swipe = scroll).
// /food/manage/pitch: who to see (live from the back office) and the team's questions.

import { $, $$, api, formMessage, copyText } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const deck = $('#pz-deck');
if (deck) {
  const slides = $$('.pz-slide', deck);
  const now = () => Math.round(deck.scrollTop / deck.clientHeight);
  const go = (d) => slides[Math.max(0, Math.min(slides.length - 1, now() + d))].scrollIntoView({ behavior: 'smooth' });
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
  document.addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); }
    if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1); }
  });
  deck.focus();
}

const root = $('#pzn');
if (root) (async () => {
  let D;
  try { D = await api('/api/food/manage'); } catch {
    $('#team-login').hidden = false;
    $('#team-link').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/staff/link', { method: 'POST', body: { email: e.target.email.value, next: e.target.next.value } }); formMessage(e.target, 'If you’re on TAM’s team, a sign-in link is on its way.', true); } catch (err) { formMessage(e.target, err.message); }
    });
    return;
  }
  root.hidden = false;
  $('#pzn-who').innerHTML = `${esc(D.me.name)} · <button class="linkish" type="button" id="pzn-out">Sign out</button>`;
  $('#pzn-out').onclick = async () => { await api('/api/staff/signout', { method: 'POST', body: {} }).catch(() => {}); location.reload(); };
  $('[data-copy="staff"]').onclick = async () => { const ok = await copyText($('.pz-quote').textContent.trim()); $('[data-copied]').textContent = ok ? 'Copied.' : 'Select the text and copy it.'; };

  const RANK = { high: 0, medium: 1, low: 2 };
  const best = (v) => v.leads.filter((l) => l.status !== 'wrong').sort((a, b) => RANK[a.confidence] - RANK[b.confidence])[0];
  const list = D.vendors.filter((v) => v.check);
  $('#pzn-list').innerHTML = list.length ? `<table class="fd-orders"><thead><tr><th>Trader</th><th>What to ask</th><th>What we have</th></tr></thead><tbody>${list.map((v) => { const l = best(v); return `<tr><td><b>${esc(v.name)}</b></td><td>${esc(v.checkWhy || 'Owner or manager, and their best email')}</td>
    <td>${v.email ? `${esc(v.email)} (confirmed)` : l ? `${esc(l.email)} <small>(${esc(l.confidence)} confidence)</small>` : '<small class="muted">nothing yet</small>'}${v.phone ? `<br><small>${esc(v.phone)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table>`
    : '<p class="muted">Nobody left to see.</p>';

  const drawQs = async () => {
    const { questions } = await api('/api/food/manage/questions');
    $('#pzn-qs').innerHTML = questions.map((q) => `<div class="pz-q ${q.status}"><p><b>${esc(q.by)}</b>${q.about ? ` · ${esc(q.about)}` : ''} · <small>${esc(new Date(q.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</small></p><p>${esc(q.text)}</p>
      ${q.answer ? `<p class="pz-a"><b>${esc(q.answeredBy)}:</b> ${esc(q.answer)}</p>` : ''}
      <form data-q="${esc(q.id)}" class="pz-answer"><textarea name="answer" rows="2" maxlength="3000" placeholder="${q.answer ? 'Reply again…' : 'Answer…'}"></textarea><div class="row-btn"><button class="btn ghost small" type="submit">Answer</button>${q.status !== 'done' ? '<button class="linkish small" type="button" data-done>Mark done</button>' : '<small class="muted">Done</small>'}</div><p class="err" role="status"></p></form></div>`).join('');
    $$('[data-q]', $('#pzn-qs')).forEach((f) => {
      f.addEventListener('submit', async (e) => { e.preventDefault(); try { await api(`/api/food/manage/questions/${f.dataset.q}`, { method: 'POST', body: { answer: f.answer.value } }); drawQs(); } catch (err) { formMessage(f, err.message); } });
      const d = $('[data-done]', f); if (d) d.onclick = async () => { await api(`/api/food/manage/questions/${f.dataset.q}`, { method: 'POST', body: { status: 'done' } }); drawQs(); };
    });
  };
  const qf = $('#pzn-q');
  qf.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/food/manage/questions', { method: 'POST', body: { about: qf.about.value, text: qf.text.value } }); qf.reset(); formMessage(qf, 'Sent. Sieng will answer here.', true); drawQs(); } catch (err) { formMessage(qf, err.message); }
  });
  drawQs();
})();
