// Staff: Sunday Showcases. Add a showcase (date, the night it's part of, how
// many acts), then name the acts in running order. Each act is a present
// under the tree on /sunday-showcases; a blank name reads "to be announced".
// The public page shows the next showcase still to come.

import { $, $$, api, shrinkImage } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#sc-manage');
let data = null, pick = null;

const row = (a = {}, i) => `<fieldset class="sh-card sc-m-act" data-row><legend>Act ${i + 1}${a.wants ? ` · ✦ ${a.wants} want them at Christmas` : ''}${a.href ? ` · <a href="${esc(a.href)}" target="_blank" rel="noopener">their page ↗</a>` : ''}</legend>
  <div class="fields"><label class="field"><span>Their page’s vibe</span><select data-k="vibe">${Object.entries(data.vibes || {}).map(([k, v]) => `<option value="${k}" ${k === (a.vibe || 'stage') ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
  <label class="field"><span>Where they’re from (country codes)</span><input data-k="from" value="${esc((a.from || []).join(', '))}" maxlength="20" placeholder="e.g. MY, GB" list="sc-places"></label></div>
  <div class="fields"><label class="field"><span>Name</span><input data-k="name" value="${esc(a.name)}" maxlength="80" placeholder="Leave blank: to be announced"></label>
  <label class="field"><span>What they play</span><input data-k="plays" value="${esc(a.plays)}" maxlength="80" placeholder="e.g. soul trio"></label>
  <label class="field full"><span>Links, one per line</span><textarea data-k="links" rows="2" maxlength="1200" placeholder="Instagram, Spotify, YouTube…">${esc((a.links || []).map((k) => k.url || k).join('\n'))}</textarea></label>
  <label class="field full"><span>About them (their bio)</span><textarea data-k="blurb" rows="4" maxlength="1200">${esc(a.blurb)}</textarea></label>
  <div class="fields"><label class="field"><span>Song for their page (YouTube link)</span><input data-k="songUrl" value="${esc(a.song && a.song.youtubeId ? `https://www.youtube.com/watch?v=${a.song.youtubeId}` : '')}" maxlength="200" placeholder="Plays through Tamalume; the page moves with it"></label>
  <label class="field"><span>Song title</span><input data-k="songTitle" value="${esc((a.song && a.song.title) || '')}" maxlength="120"></label></div>
  <input type="hidden" data-k="slug" value="${esc(a.slug || '')}">
  <input type="hidden" data-k="media" value="${esc(JSON.stringify(a.media || []))}">
  <input type="hidden" data-k="press" value="${esc(JSON.stringify(a.press || []))}">
  ${(a.press || []).length ? `<p class="small muted full">In the press: ${a.press.map((p) => esc(p.source || p.title)).join(', ')}.</p>` : ''}
  ${(a.media || []).length ? `<p class="small muted full">Also on their profile: ${a.media.filter((m) => m.type === 'video').length} video(s), ${a.media.filter((m) => m.type === 'image').length} more photo(s).</p>` : ''}
  <div class="field full sc-m-photo"><span>Photo</span><input type="hidden" data-k="photo" value="${esc(a.photo)}">
    ${a.photo ? `<img src="${esc(a.photo)}" alt="" width="72" height="72">` : ''}<input type="file" accept="image/*" data-photo aria-label="Photo for act ${i + 1}">
    ${a.photo ? '<button class="btn ghost small" type="button" data-nophoto>Remove photo</button>' : ''}</div></div>
  <button class="sh-x" type="button" data-del aria-label="Remove act ${i + 1}">×</button></fieldset>`;

const nightOptions = (date, chosen) => {
  const on = data.nights.filter((n) => n.date === date);
  return `<option value="">Not part of a listed night</option>${on.map((n) => `<option value="${esc(n.slug)}" ${n.slug === chosen ? 'selected' : ''}>${esc(n.title)}</option>`).join('')}`;
};

function render(acts) {
  const s = data.showcases.find((x) => x.date === pick);
  const tabs = `<div class="admin-tabs">${data.showcases.map((x, i) => `<button class="chip" type="button" data-pick="${x.date}" aria-pressed="${x.date === pick}">${esc(x.when.replace(/ \d{4}$/, ''))}${i === 0 ? ' · on the page' : ''}</button>`).join('')}</div>`;
  const add = `<form class="sh-card" id="sc-new"><h3>Add a showcase</h3><div class="fields">
    <label class="field"><span>Date</span><input type="date" name="date" min="${data.today}" required></label>
    <label class="field"><span>How many acts</span><input name="count" inputmode="numeric" value="6"></label></div>
    <button class="btn hot small" type="submit">Add</button> <span class="small muted" id="sc-new-msg"></span></form>`;
  if (!s) { root.innerHTML = `${tabs}<p class="muted">No showcases coming up. Add one below.</p>${add}`; return; }
  const list = acts || s.acts.map((a) => (a.tba ? {} : a));
  root.innerHTML = `${tabs}<datalist id="sc-places">${Object.entries(data.places || {}).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</datalist><form id="sc-m"><h2>${esc(s.when)}</h2>
  <label class="field"><span>Part of which night</span><select name="night">${nightOptions(s.date, s.night && s.night.slug)}</select></label>
  <div id="sc-acts">${list.map(row).join('')}</div>
  <p><button class="btn ghost small" type="button" data-add>+ Add an act</button></p>
  <label class="field"><span>Note on the page (optional)</span><input name="note" value="${esc(s.saved.note)}" maxlength="200"></label>
  <p><button class="btn hot" type="submit">Save</button> <span class="small muted" id="sc-saved"></span>
    <button class="btn ghost small" type="button" data-remove style="float:right">Remove this showcase</button></p></form>
  <section class="sh-card ro" id="sc-run" data-date="${s.date}" aria-label="Running order"></section>${add}`;
}

const current = () => $$('[data-row]', root).map((f) => {
  const a = Object.fromEntries($$('[data-k]', f).map((i) => [i.dataset.k, i.value.trim()]));
  let media = [], press = [];
  try { media = JSON.parse(a.media || '[]'); } catch { /* keep none */ }
  try { press = JSON.parse(a.press || '[]'); } catch { /* keep none */ }
  const song = a.songUrl ? { url: a.songUrl, title: a.songTitle } : null;
  delete a.songUrl; delete a.songTitle;
  return { ...a, media, press, song, links: a.links ? a.links.split(/\s+/).filter(Boolean) : [] };
});
const rowOf = (el) => $$('[data-row]', root).indexOf(el.closest('[data-row]'));

// a photo for an act: shrunk in the browser, uploaded, then saved with the line-up
root.addEventListener('change', async (e) => {
  const inp = e.target.closest('[data-photo]'); if (!inp || !inp.files[0]) return;
  const box = inp.closest('.sc-m-photo');
  try {
    const { photo } = await api('/api/showcases/photo', { method: 'POST', body: { image: await shrinkImage(inp.files[0], 1000, 0.84) } });
    const acts = current(); acts[rowOf(inp)].photo = photo; render(acts);
    $('#sc-saved').textContent = 'Photo added. Press Save to put it on the page.';
  } catch (err) { box.insertAdjacentHTML('beforeend', `<p class="err">${esc(err.message)}</p>`); }
});

async function load(go) {
  data = await api('/api/showcases/manage');
  pick = go || (data.showcases.some((x) => x.date === pick) ? pick : (data.showcases[0] || {}).date);
  render();
}

load().then(() => { root.hidden = false; }).catch(() => { $('#team-login').hidden = false; });

root.addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pick) { pick = b.dataset.pick; render(); }
  if (b.hasAttribute('data-add')) render([...current(), {}]);
  if (b.hasAttribute('data-nophoto')) { const acts = current(); acts[rowOf(b)].photo = ''; render(acts); }
  if (b.hasAttribute('data-del')) { const all = current(); all.splice($$('[data-row]', root).indexOf(b.closest('[data-row]')), 1); render(all); }
  if (b.hasAttribute('data-remove') && confirm('Remove this showcase? It comes off the page.')) {
    await api(`/api/showcases/${pick}/remove`, { method: 'POST', body: {} }); pick = null; await load();
  }
});

root.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id === 'sc-new') {
    const f = e.target, date = f.date.value;
    try {
      // a new showcase goes on the night listed that day, if there is one
      const on = data.nights.find((n) => n.date === date);
      await api(`/api/showcases/${date}`, { method: 'POST', body: { count: f.count.value, acts: [], night: on ? on.slug : '' } });
      await load(date);
    } catch (err) { $('#sc-new-msg').textContent = err.message; }
    return;
  }
  const acts = current();
  try {
    const r = await api(`/api/showcases/${pick}`, { method: 'POST', body: { acts, count: acts.length, note: $('[name=note]', root).value, night: $('[name=night]', root).value } });
    await load(pick);
    $('#sc-saved').textContent = `Saved. ${r.acts.filter((a) => !a.tba).length} of ${r.count} acts named.`;
  } catch (err) { $('#sc-saved').textContent = err.message; }
});
