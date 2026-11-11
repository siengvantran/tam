// An act's own Sunday Showcase page: invite friends (the phone's share sheet
// where there is one, or WhatsApp, email, text, copy), and "I want to see them
// at the Christmas Showcase Special" (one vote per browser).

import { api } from './lib.js';
import { signal, signalOnce } from './track.js';

// how visitors react, for the running order (public/js/track.js)
const SIG = (document.querySelector('[data-signal]') || {}).dataset?.signal;
signalOnce(SIG, 'view');
document.addEventListener('click', (e) => {
  const how = e.target.closest('[data-share] a, [data-share] button');
  if (how) signal(SIG, 'invite', { method: (how.textContent || '').trim().toLowerCase() });
  if (e.target.closest('.va-socials a, .sc-links a')) signal(SIG, 'follow', { network: (e.target.closest('a').querySelector('.va-net') || e.target.closest('a')).textContent.trim() });
});
document.querySelectorAll('video').forEach((v) => v.addEventListener('play', () => signalOnce(SIG, 'play'), { once: true }));

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ----- the invite card -----
const card = document.querySelector('[data-card]');
let pic = card ? (card.style.getPropertyValue('--pic').match(/url\(['"]?(.*?)['"]?\)/) || [])[1] : '';
document.querySelectorAll('input[name="card-pic"]').forEach((r) => r.addEventListener('change', () => {
  pic = r.value; card.style.setProperty('--pic', `url('${pic}')`);
}));

const load = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
const cover = (g, im, w, h) => { const s = Math.max(w / im.width, h / im.height); g.drawImage(im, (w - im.width * s) / 2, (h - im.height * s) * 0.3, im.width * s, im.height * s); };
// the biggest size up to `size` at which `t` fits in `max` pixels
const fit = (g, t, max, size, font) => { let px = size; g.font = font.replace('{px}', px); while (g.measureText(t).width > max && px > 16) { px -= 2; g.font = font.replace('{px}', px); } };

// The card as a 1080×1350 picture, the same as the one on the page.
async function drawCard() {
  await document.fonts.ready;
  const W = 1080, H = 1350, d = card.dataset, cs = getComputedStyle(document.body);
  const v = (k, f) => (cs.getPropertyValue(k) || f).trim();
  const c1 = v('--v-1', '#e8c77a'), c2 = v('--v-2', '#ff2ea6'), c3 = v('--v-3', '#22e1ff'), bg = v('--v-bg', '#0b0709');
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (pic) { try { cover(g, await load(pic), W, H); } catch { /* keep the colour */ } }
  let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(.3, 'rgba(0,0,0,.05)'); gr.addColorStop(.62, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,.92)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = c1; g.lineWidth = 10; g.strokeRect(28, 28, W - 56, H - 56);
  // the Sunday Showcase lockup, top left
  try { g.drawImage(await load('/img/sunday-showcase-mark.svg'), 70, 70, 130, 130); } catch { /* no mark */ }
  g.fillStyle = '#fff6e6'; g.textBaseline = 'alphabetic';
  g.font = 'italic 64px "DM Serif Display", Georgia, serif'; g.fillText('Sunday', 222, 132);
  g.font = '64px "Bebas Neue", "Arial Narrow", sans-serif'; g.fillStyle = c1;
  g.letterSpacing = '10px'; g.fillText('SHOWCASE', 222, 196); g.letterSpacing = '0px';
  g.font = '34px "Bebas Neue", "Arial Narrow", sans-serif'; g.fillStyle = c3; g.textAlign = 'right'; g.fillText(d.act.toUpperCase(), W - 70, 118); g.textAlign = 'left';
  // the act
  g.shadowColor = c2; g.shadowOffsetX = 6; g.shadowOffsetY = 6; g.shadowBlur = 0; g.fillStyle = '#fff6e6';
  fit(g, d.name.toUpperCase(), W - 140, 190, '{px}px "Bebas Neue", "Arial Narrow", sans-serif'); g.fillText(d.name.toUpperCase(), 70, 1000);
  g.shadowColor = 'transparent';
  if (d.plays) { g.fillStyle = c1; fit(g, d.plays, W - 140, 46, 'italic 600 {px}px Inter, Arial, sans-serif'); g.fillText(d.plays, 70, 1062); }
  // "Sunday Showcase × TAM"
  let x = 70; const y = 1170;
  g.fillStyle = '#fff6e6'; g.font = 'italic 54px "DM Serif Display", Georgia, serif'; g.fillText('Sunday', x, y); x += g.measureText('Sunday ').width;
  g.font = '60px "Bebas Neue", "Arial Narrow", sans-serif'; g.fillText('SHOWCASE', x, y); x += g.measureText('SHOWCASE').width + 22;
  g.fillStyle = c2; g.font = '56px Inter, Arial, sans-serif'; g.fillText('×', x, y - 4); x += g.measureText('×').width + 22;
  try { g.drawImage(await load('/img/tam-mark-96.png'), x, y - 54, 60, 60); } catch { /* no mark */ } x += 72;
  g.fillStyle = c1; g.font = '72px "Bebas Neue", "Arial Narrow", sans-serif'; g.letterSpacing = '4px'; g.fillText('TAM', x, y + 2); g.letterSpacing = '0px';
  const when = `${d.day}${d.doors ? ` · ${d.doors}` : ''} · Elephant & Castle`;
  g.fillStyle = '#e9e1d6'; fit(g, when, W - 140, 38, '600 {px}px Inter, Arial, sans-serif'); g.fillText(when, 70, 1238);
  g.fillStyle = c3; g.letterSpacing = '3px'; fit(g, d.site.toUpperCase(), W - 140, 30, '{px}px "Bebas Neue", "Arial Narrow", sans-serif'); g.fillText(d.site.toUpperCase(), 70, 1290); g.letterSpacing = '0px';
  return new Promise((ok) => cv.toBlob(ok, 'image/png'));
}

// ----- invites: send the card, save it, or send the link -----
const share = document.querySelector('[data-share]');
if (share) {
  const { url, text, title, file } = share.dataset;
  const msg = document.querySelector('[data-share-msg]');
  const native = share.querySelector('[data-native]');
  if (navigator.share) {
    native.hidden = false;
    native.addEventListener('click', async () => {
      try {
        const f = card && new File([await drawCard()], file, { type: 'image/png' });
        const data = f && navigator.canShare && navigator.canShare({ files: [f] }) ? { files: [f], title, text } : { title, text, url };
        await navigator.share(data);
      } catch (err) { if (err && err.name !== 'AbortError') msg.textContent = 'Couldn’t open sharing here. Save the card instead.'; }
    });
  }
  const save = share.querySelector('[data-save]');
  if (save && card) save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await drawCard()), download: file });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      msg.textContent = 'Card saved. Post it, or send it with the link.';
    } catch { msg.textContent = 'Couldn’t make the card here.'; }
    save.disabled = false;
  });
  share.querySelector('[data-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); msg.textContent = 'Link copied. Paste it anywhere.'; }
    catch { msg.textContent = url; }
  });
}

// ----- the Christmas Showcase Special vote -----
const want = document.querySelector('[data-want]');
if (want) {
  const key = `tam:want:${want.dataset.want}`;
  const count = document.querySelector('[data-want-count]');
  const name = document.querySelector('.va-name').textContent;
  let id = store.get('tam:browser');
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/[^\w-]/g, ''); store.set('tam:browser', id); }
  const done = (n) => {
    want.disabled = true; want.textContent = `✦ You want ${name} at Christmas`;
    count.textContent = `${n} ${n === 1 ? 'person wants' : 'people want'} to see ${name} at Christmas`;
  };
  if (store.get(key)) want.disabled = true, want.textContent = `✦ You want ${name} at Christmas`;
  want.addEventListener('click', async () => {
    want.disabled = true;
    try {
      const r = await api(want.dataset.want, { method: 'POST', body: { id } });
      store.set(key, '1'); done(r.count);
      if (window.tamTrack) window.tamTrack('showcase_vote', { act: SIG.split('/').pop() });
      document.body.classList.add('va-cheer'); setTimeout(() => document.body.classList.remove('va-cheer'), 1600);
    } catch (err) { want.disabled = false; count.textContent = err.message; }
  });
}
