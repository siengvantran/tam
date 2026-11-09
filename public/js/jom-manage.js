// The JOM desk: approve, hide, add and edit Junior Open Mic profiles.
// Staff only (Ops and Admin): sign in at /shows.

import { $, api } from './lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#jom-manage');
let data = null, editing = null, photo; // editing: an artist id, 'new', or null

const STATE = { pending: 'Waiting', live: 'Live', hidden: 'Hidden' };

function fieldsView(f) {
  if (!f) return '';
  return `<div class="jm-fields">${f.photo ? `<img src="${esc(f.photo)}" alt="" width="72" height="90">` : ''}<div>
    <b>${esc(f.name)}</b>${f.act ? ` <span class="muted">${esc(f.act)}</span>` : ''}
    ${f.bio ? `<p>${esc(f.bio)}</p>` : ''}
    ${f.genres.length ? `<p class="small"><span class="muted">Styles:</span> ${esc(f.genres.join(', '))}</p>` : ''}
    ${f.setlist.length ? `<p class="small"><span class="muted">Setlist:</span> ${esc(f.setlist.join(' · '))}</p>` : ''}
    ${f.stage.length ? `<p class="small"><span class="muted">Stage time:</span> ${esc(f.stage.join(' · '))}</p>` : ''}
    ${f.links.length ? `<p class="small"><span class="muted">Links:</span> ${f.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join(' · ')}</p>` : ''}
  </div></div>`;
}

function card(a) {
  const waiting = a.status === 'pending' || a.draft;
  return `<li class="sh-card jm-card st-${a.status}">
    <div class="jm-head"><h3>${esc((a.draft || a.live).name)}</h3><span class="tag small">${STATE[a.status]}${a.draft && a.live ? ' · changes waiting' : ''}</span>
      <span class="small muted">${a.followers} following · ${esc(a.by)} · ${esc(a.updatedAt.slice(0, 16).replace('T', ' '))}${a.guardianEmail ? ` · guardian <a href="mailto:${esc(a.guardianEmail)}">${esc(a.guardianEmail)}</a>` : ''}</span></div>
    ${a.draft && a.live ? `<div class="jm-two"><div><div class="bj-k">Live now</div>${fieldsView(a.live)}</div><div><div class="bj-k">Waiting for your OK</div>${fieldsView(a.draft)}</div></div>` : fieldsView(a.draft || a.live)}
    <div class="bj-m-btns">
      ${waiting ? `<button class="btn hot small" type="button" data-act="approve" data-id="${a.id}">${a.live && a.draft ? 'Approve changes' : 'Approve'}</button>` : ''}
      ${a.draft && a.live ? `<button class="btn ghost small" type="button" data-act="discard" data-id="${a.id}">Discard changes</button>` : ''}
      ${a.status === 'live' ? `<button class="btn ghost small" type="button" data-act="hide" data-id="${a.id}">Hide</button>` : ''}
      ${a.status === 'hidden' ? `<button class="btn ghost small" type="button" data-act="show" data-id="${a.id}">Show again</button>` : ''}
      <button class="btn ghost small" type="button" data-edit="${a.id}">Edit</button>
      ${a.status === 'live' ? `<a class="btn ghost small" href="/jom#a-${a.id}" target="_blank" rel="noopener">View ↗</a>` : ''}
      <button class="btn ghost small" type="button" data-act="remove" data-id="${a.id}">Remove</button>
    </div></li>`;
}

function form() {
  const a = editing === 'new' ? null : data.artists.find((x) => x.id === editing);
  const f = a ? (a.draft || a.live) : { name: '', act: '', bio: '', genres: [], setlist: [], stage: [], links: [], hue: data.hues[0], photo: '' };
  const link = (n) => `<div class="fields"><label class="field"><span>Link ${n} label</span><input name="l${n}label" maxlength="40" value="${esc(f.links[n - 1] ? f.links[n - 1].label : '')}"></label><label class="field"><span>Link ${n} address</span><input name="l${n}url" type="url" maxlength="300" placeholder="https://…" value="${esc(f.links[n - 1] ? f.links[n - 1].url : '')}"></label></div>`;
  return `<form class="sh-card" id="jm-form"><h3>${a ? `Edit ${esc(f.name)}` : 'Add an artist'}</h3>
    <p class="small muted">Saved profiles go live straight away${a && a.draft ? ', and replace the changes that were waiting' : ''}.</p>
    <div class="fields"><label class="field"><span>Stage name</span><input name="name" maxlength="40" required value="${esc(f.name)}"></label>
      <label class="field"><span>What they do</span><input name="act" maxlength="60" value="${esc(f.act)}"></label>
      <label class="field full"><span>About</span><textarea name="bio" maxlength="600" rows="3">${esc(f.bio)}</textarea></label>
      <label class="field full"><span>Styles (commas)</span><input name="genres" maxlength="120" value="${esc(f.genres.join(', '))}"></label>
      <label class="field"><span>Setlist (one per line)</span><textarea name="setlist" rows="4">${esc(f.setlist.join('\n'))}</textarea></label>
      <label class="field"><span>Stage time (one per line)</span><textarea name="stage" rows="4">${esc(f.stage.join('\n'))}</textarea></label></div>
    ${link(1)}${link(2)}${link(3)}
    <div class="fields"><label class="field"><span>Colour</span><select name="hue">${data.hues.map((x, i) => `<option value="${x}" ${x === f.hue ? 'selected' : ''}>Colour ${i + 1}</option>`).join('')}</select></label>
      <label class="field"><span>Guardian’s email (staff only)</span><input name="guardianEmail" type="email" value="${esc(a ? a.guardianEmail : '')}"></label>
      <label class="field"><span>Photo ${f.photo ? '(replaces the current one)' : ''}</span><input type="file" id="jm-photo" accept="image/*"></label>
      ${f.photo ? '<label class="field sh-check" style="align-self:end"><input type="checkbox" name="nophoto"> Remove the photo</label>' : ''}</div>
    <button class="btn hot" type="submit">${a ? 'Save' : 'Add to the lineup'}</button> <button class="btn ghost" type="button" data-cancel>Cancel</button><p class="err" role="status" aria-live="polite"></p></form>`;
}

function render() {
  const order = { pending: 0, live: 1, hidden: 2 };
  const list = [...data.artists].sort((x, y) => (Number(Boolean(y.draft)) - Number(Boolean(x.draft))) || order[x.status] - order[y.status]);
  const waiting = data.artists.filter((a) => a.status === 'pending' || a.draft).length;
  root.innerHTML = `<p>${waiting ? `<span class="tag">${waiting} to check</span> ` : ''}<span class="muted">${data.artists.filter((a) => a.status === 'live').length} live. Nothing a family sends is public until someone here approves it.</span></p>
    ${editing ? form() : '<p><button class="btn hot small" type="button" data-edit="new">+ Add an artist</button></p>'}
    ${list.length ? `<ul class="plain jm-list">${list.map(card).join('')}</ul>` : '<p class="muted">No profiles yet. They queue here as families send them in.</p>'}`;
}

async function load() { data = await api('/api/jom/manage'); render(); }

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const W = 720, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H;
      const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
      c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 3, w, h); URL.revokeObjectURL(img.src);
      let q = 0.8, out; do { out = c.toDataURL('image/jpeg', q); q -= 0.12; } while (out.length > 380000 && q > 0.25);
      resolve(out);
    };
    img.onerror = () => reject(new Error('That image couldn’t be read.'));
    img.src = URL.createObjectURL(file);
  });
}

if (root) {
  load().then(() => { root.hidden = false; }).catch(() => { $('#team-login').hidden = false; });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.edit) { editing = b.dataset.edit; photo = undefined; render(); $('#jm-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if ('cancel' in b.dataset) { editing = null; render(); return; }
    if (b.dataset.act) {
      if (b.dataset.act === 'remove' && !confirm('Remove this profile for good? Its followers and cheers go too.')) return;
      try { await api(`/api/jom/manage/${b.dataset.id}`, { method: 'POST', body: { action: b.dataset.act } }); await load(); } catch (err) { alert(err.message); }
    }
  });
  root.addEventListener('change', async (e) => {
    if (e.target.id !== 'jm-photo' || !e.target.files[0]) return;
    try { photo = await readPhoto(e.target.files[0]); } catch (err) { alert(err.message); e.target.value = ''; }
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'jm-form') return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const links = [1, 2, 3].map((n) => ({ label: f[`l${n}label`], url: f[`l${n}url`] })).filter((l) => l.url);
    const body = { ...(editing !== 'new' ? { id: editing } : {}), name: f.name, act: f.act, bio: f.bio, genres: f.genres.split(','), setlist: f.setlist.split('\n'), stage: f.stage.split('\n'),
      links, hue: Number(f.hue), guardianEmail: f.guardianEmail, ...(f.nophoto ? { photo: '' } : photo ? { photo } : {}) };
    try { await api('/api/jom/manage', { method: 'POST', body }); editing = null; photo = undefined; await load(); }
    catch (err) { e.target.querySelector('.err').textContent = err.message; }
  });
}
