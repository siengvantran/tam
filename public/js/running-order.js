// Staff: the Sunday Showcase running order, in /sunday-showcases/manage.
// A draft arranged as a show, with why each act is where it is; Vivian moves
// acts, sets lengths and changeovers, ticks each act off at sound check, and
// publishes only when everyone has sound-checked. Visitor numbers for each act
// sit alongside, with any changes they suggest. Nothing here is public until
// it's published; editing a published order takes the times down again until
// it's re-published.

import { $, $$, api } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cache = new Map(); // date → { run, dirty }
let busy = false;

async function fetchRun(date) {
  const run = await api(`/api/showcases/${date}/run`);
  cache.set(date, { run, dirty: false });
  return run;
}

const names = () => new Map($$('#sc-acts [data-row]').map((f) => [($('[data-k="slug"]', f) || {}).value, ($('[data-k="name"]', f) || {}).value]));

function render(box, date) {
  const st = cache.get(date); if (!st) return;
  const r = st.run, nm = names();
  const name = (slug) => nm.get(slug) || slug;
  const ready = r.slots.every((x) => x.soundcheck);
  const pub = r.status === 'published';
  box.innerHTML = `<div class="ro-head"><h2>Running order</h2><span class="tag ${pub ? 'ro-live' : ''}">${pub ? `Published${r.publishedBy ? ` by ${esc(r.publishedBy)}` : ''}` : 'Draft: not public'}</span></div>
  <p class="small muted">Arranged as a show from each act's vibe. Move acts, set lengths, then tick each act off at sound check. Times go on the site only when you publish${pub ? '; changing anything takes them down until you publish again' : ''}.</p>
  <div class="fields ro-times">
    <label class="field"><span>First act on</span><input type="time" data-ro="start" value="${esc(r.start)}"></label>
    <label class="field"><span>Night ends</span><input type="time" data-ro="end" value="${esc(r.end)}"></label>
    <label class="field"><span>Interval after</span><select data-ro="after"><option value="-1" ${r.interval.after < 0 ? 'selected' : ''}>No interval</option>${r.slots.slice(0, -1).map((x, i) => `<option value="${i}" ${r.interval.after === i ? 'selected' : ''}>${esc(name(x.slug))}</option>`).join('')}</select></label>
    <label class="field"><span>Interval (min)</span><input inputmode="numeric" data-ro="imins" value="${esc(r.interval.mins)}"></label>
  </div>
  <ol class="plain ro-list">${r.slots.map((x, i) => `<li class="ro-slot${x.soundcheck ? ' ok' : ''}" data-i="${i}">
    <div class="ro-when"><b>${esc(x.on || '')}</b><span>–${esc(x.off || '')}</span></div>
    <div class="ro-main"><div class="ro-name"><b>${i + 1}. ${esc(name(x.slug))}</b>
      <span class="ro-move"><button class="sh-x" type="button" data-up aria-label="Move ${esc(name(x.slug))} earlier" ${i ? '' : 'disabled'}>↑</button><button class="sh-x" type="button" data-down aria-label="Move ${esc(name(x.slug))} later" ${i < r.slots.length - 1 ? '' : 'disabled'}>↓</button></span></div>
      <div class="ro-nums"><label>Set <input inputmode="numeric" data-k="mins" value="${esc(x.mins)}"> min</label>${i ? `<label>Changeover <input inputmode="numeric" data-k="changeover" value="${esc(x.changeover)}"> min</label>` : ''}
        <label class="ro-sc"><input type="checkbox" data-k="soundcheck" ${x.soundcheck ? 'checked' : ''}> Sound-checked${x.soundcheckAt ? ` <span class="small muted">${esc(x.soundcheckBy || '')} ${esc(x.soundcheckAt.slice(11, 16))}</span>` : ''}</label></div>
      <label class="field ro-why"><span>Why here</span><textarea rows="2" data-k="why" maxlength="400">${esc(x.why)}</textarea></label>
    </div></li>${r.intervalAt && i === r.interval.after ? `<li class="ro-int">Interval ${esc(r.intervalAt.from)}–${esc(r.intervalAt.to)}</li>` : ''}`).join('')}</ol>
  <p class="ro-total">${r.over ? `<b class="err">Finishes ${esc(r.finish)}: ${r.over} min over</b>` : `Finishes <b>${esc(r.finish)}</b>${r.spare ? ` · ${r.spare} min spare` : ''}`}</p>
  ${r.checks.length ? `<ul class="plain ro-checks">${r.checks.map((c) => `<li class="ro-${c.level}">${esc(c.text)}</li>`).join('')}</ul>` : ''}
  <p class="ro-btns"><button class="btn hot" type="button" data-save>${st.dirty ? 'Save changes' : 'Save draft'}</button>
    <button class="btn ghost" type="button" data-auto>Re-arrange as a show</button>
    ${pub ? '<button class="btn ghost" type="button" data-unpub>Take the times down</button>' : `<button class="btn va-btn" type="button" data-pub ${ready && !st.dirty ? '' : 'disabled'} title="${ready ? (st.dirty ? 'Save first' : '') : 'Every act needs to sound-check first'}">Publish the running order</button>`}
    <span class="small muted" data-ro-msg role="status" aria-live="polite"></span></p>
  <details class="ro-why-all" open><summary><h3>Why the line-up is this way</h3></summary><ul>${r.principles.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></details>
  <h3>How visitors are reacting</h3>
  <p class="small muted">From each act's page and the tree: views, Christmas votes, invites sent, follows, clips played, presents unwrapped. Totals only. A vote counts ×5, an invite ×4, a follow ×2, a play ×1, an unwrap ×½. With Google Analytics switched on, the same events go there too (for visitors who say yes to its cookies).</p>
  <div class="ro-table"><table><thead><tr><th>#</th><th>Act</th><th>Views</th><th>Votes</th><th>Invites</th><th>Follows</th><th>Plays</th><th>Unwraps</th><th>Score</th><th>Per view</th></tr></thead>
  <tbody>${[...r.metrics].sort((a, b) => a.rank - b.rank).map((m) => `<tr><td>${m.rank}</td><td>${esc(m.name)}</td><td>${m.view}</td><td>${m.vote}</td><td>${m.invite}</td><td>${m.follow}</td><td>${m.play}</td><td>${m.unwrap}</td><td><b>${m.score}</b></td><td>${m.perView}</td></tr>`).join('')}</tbody></table></div>
  <h3>Suggestions</h3>
  ${r.suggestions.length ? `<ul class="plain ro-sugg">${r.suggestions.map((s, k) => `<li>${esc(s.text)}${s.kind === 'swap' ? ` <button class="btn ghost small" type="button" data-apply="${k}">Try it</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nothing to change: the order and the crowd agree.</p>'}`;
}

// read the panel back into the draft
function collect(box, date) {
  const r = cache.get(date).run;
  r.start = $('[data-ro="start"]', box).value; r.end = $('[data-ro="end"]', box).value;
  r.interval = { after: Number($('[data-ro="after"]', box).value), mins: Number($('[data-ro="imins"]', box).value) || 0 };
  $$('.ro-slot', box).forEach((li) => {
    const x = r.slots[Number(li.dataset.i)];
    const mins = $('[data-k="mins"]', li), co = $('[data-k="changeover"]', li), why = $('[data-k="why"]', li);
    x.mins = Number(mins.value) || x.mins; if (co) x.changeover = Number(co.value) || 0;
    if (why.value !== x.why) { x.why = why.value; x.whyCustom = true; }
    x.soundcheck = $('[data-k="soundcheck"]', li).checked;
  });
  return r;
}

async function act(box, date, fn) {
  if (busy) return; busy = true;
  const msg = (t) => { const m = $('[data-ro-msg]', box); if (m) m.textContent = t; };
  try { const run = await fn(); cache.set(date, { run, dirty: false }); render(box, date); msg('Saved.'); }
  catch (err) { msg(err.message); }
  busy = false;
}
const body = (r) => ({ start: r.start, end: r.end, interval: r.interval, slots: r.slots.map(({ slug, mins, changeover, soundcheck, why, whyCustom }) => ({ slug, mins, changeover, soundcheck, why, whyCustom })) });

function wire(box) {
  const date = box.dataset.date;
  if (box.dataset.wired === date) return;
  box.dataset.wired = date;
  (cache.get(date) ? Promise.resolve() : fetchRun(date)).then(() => render(box, date)).catch((err) => { box.textContent = err.message; });
  box.addEventListener('input', () => { const st = cache.get(date); if (st && !st.dirty) { st.dirty = true; const b = $('[data-save]', box); if (b) b.textContent = 'Save changes'; const p = $('[data-pub]', box); if (p) { p.disabled = true; p.title = 'Save first'; } } });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const st = cache.get(date); if (!st) return;
    const move = (i, j) => { collect(box, date); const s = st.run.slots; [s[i], s[j]] = [s[j], s[i]]; return act(box, date, () => api(`/api/showcases/${date}/run`, { method: 'POST', body: body(st.run) })); };
    const li = b.closest('.ro-slot'), i = li ? Number(li.dataset.i) : -1;
    if (b.hasAttribute('data-up')) return move(i, i - 1);
    if (b.hasAttribute('data-down')) return move(i, i + 1);
    if (b.dataset.apply !== undefined) { const [x, y] = st.run.suggestions[Number(b.dataset.apply)].swap; return move(x, y); }
    if (b.hasAttribute('data-save')) return act(box, date, () => api(`/api/showcases/${date}/run`, { method: 'POST', body: body(collect(box, date)) }));
    if (b.hasAttribute('data-auto') && confirm('Re-arrange the acts as a show from their vibes? Sound checks are kept; reasons you wrote are replaced.')) return act(box, date, () => api(`/api/showcases/${date}/run`, { method: 'POST', body: { auto: true } }));
    if (b.hasAttribute('data-pub') && confirm('Publish the running order? The set times go on the site, and the presents and line-up take this order.')) return act(box, date, () => api(`/api/showcases/${date}/run/publish`, { method: 'POST', body: {} }));
    if (b.hasAttribute('data-unpub')) return act(box, date, () => api(`/api/showcases/${date}/run/unpublish`, { method: 'POST', body: {} }));
  });
}

// the editor re-draws itself; pick up the panel each time it appears
const watch = () => { const box = document.getElementById('sc-run'); if (box) wire(box); };
new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
watch();
