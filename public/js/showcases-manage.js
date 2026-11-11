// Staff: this week's Sunday Showcase acts, in running order. Each one is a
// present under the tree on /sunday-showcases; a blank name reads "to be announced".

import { $, $$, api } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#sc-manage');
let data = null;

const row = (a = {}, i) => `<fieldset class="sh-card sc-m-act" data-row><legend>Act ${i + 1}</legend>
  <div class="fields"><label class="field"><span>Name</span><input data-k="name" value="${esc(a.name)}" maxlength="80" placeholder="Leave blank: to be announced"></label>
  <label class="field"><span>What they play</span><input data-k="plays" value="${esc(a.plays)}" maxlength="80" placeholder="e.g. soul trio"></label>
  <label class="field full"><span>Link</span><input data-k="link" value="${esc(a.link)}" maxlength="300" placeholder="Instagram, Spotify, YouTube…"></label>
  <label class="field full"><span>One line about them</span><input data-k="blurb" value="${esc(a.blurb)}" maxlength="240"></label></div>
  <button class="sh-x" type="button" data-del aria-label="Remove act ${i + 1}">×</button></fieldset>`;

function render(acts) {
  root.innerHTML = `<form id="sc-m"><h2>${esc(data.when)}</h2>${data.night ? `<p class="muted">${esc(data.night.title)}</p>` : ''}
  <div id="sc-acts">${acts.map(row).join('')}</div>
  <p><button class="btn ghost small" type="button" data-add>+ Add an act</button></p>
  <label class="field"><span>Note on the page (optional)</span><input name="note" value="${esc(data.saved.note)}" maxlength="200"></label>
  <p><button class="btn hot" type="submit">Save</button> <span class="small muted" id="sc-saved"></span></p></form>`;
}

const current = () => $$('[data-row]', root).map((f) => Object.fromEntries($$('[data-k]', f).map((i) => [i.dataset.k, i.value.trim()])));

async function load() {
  data = await api('/api/showcases/manage');
  render(data.acts.map((a) => (a.tba ? {} : a)));
}

load().then(() => { root.hidden = false; }).catch(() => { $('#team-login').hidden = false; });
root.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-add')) render([...current(), {}]);
  if (b.hasAttribute('data-del')) { const all = current(); all.splice($$('[data-row]', root).indexOf(b.closest('[data-row]')), 1); render(all); }
});
root.addEventListener('submit', async (e) => {
  e.preventDefault();
  const acts = current();
  try {
    const r = await api(`/api/showcases/${data.date}`, { method: 'POST', body: { acts, count: acts.length, note: $('[name=note]', root).value } });
    data = { ...data, ...r, saved: { note: $('[name=note]', root).value } };
    $('#sc-saved').textContent = `Saved. ${r.acts.filter((a) => !a.tba).length} of ${r.count} acts named.`;
  } catch (err) { $('#sc-saved').textContent = err.message; }
});
