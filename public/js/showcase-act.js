// An act's own Sunday Showcase page: invite friends (the phone's share sheet
// where there is one, or WhatsApp, email, text, copy), and "I want to see them
// at the Christmas Showcase Special" (one vote per browser).

import { api, youtube } from './lib.js';
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

// The "showcase" sticker: lime pill, black outline, a hard pink shadow, a little tilt. Returns its width.
function sticker(g, t, x, y, size) {
  g.save(); g.font = `700 ${size}px Inter, Arial, sans-serif`;
  const w = g.measureText(t).width + size * 0.9, h = size * 1.35;
  g.translate(x + w / 2, y - size * 0.4); g.rotate(-0.06);
  const rr = (dx, dy) => { g.beginPath(); g.roundRect(-w / 2 + dx, -h / 2 + dy, w, h, h / 2); };
  rr(6, 6); g.fillStyle = '#ff3ea5'; g.fill();
  rr(0, 0); g.fillStyle = '#d4ff3c'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#111'; g.stroke();
  g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 0, 2);
  g.restore();
  return w;
}

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
  g.fillStyle = '#ffffff'; g.textBaseline = 'alphabetic';
  g.letterSpacing = '-3px'; g.font = '700 72px Inter, Arial, sans-serif'; g.fillText('sunday', 222, 128); g.letterSpacing = '0px';
  sticker(g, 'showcase', 226, 196, 40);
  g.font = '34px "Bebas Neue", "Arial Narrow", sans-serif'; g.fillStyle = c3; g.textAlign = 'right'; g.fillText(d.act.toUpperCase(), W - 70, 118); g.textAlign = 'left';
  // the act
  g.shadowColor = c2; g.shadowOffsetX = 6; g.shadowOffsetY = 6; g.shadowBlur = 0; g.fillStyle = '#fff6e6';
  fit(g, d.name.toUpperCase(), W - 140, 190, '{px}px "Bebas Neue", "Arial Narrow", sans-serif'); g.fillText(d.name.toUpperCase(), 70, 1000);
  g.shadowColor = 'transparent';
  if (d.plays) { g.fillStyle = c1; fit(g, d.plays, W - 140, 46, 'italic 600 {px}px Inter, Arial, sans-serif'); g.fillText(d.plays, 70, 1062); }
  // "Sunday Showcase × TAM"
  let x = 70; const y = 1170;
  g.fillStyle = '#ffffff'; g.letterSpacing = '-2px'; g.font = '700 58px Inter, Arial, sans-serif'; g.fillText('sunday', x, y); x += g.measureText('sunday').width + 14; g.letterSpacing = '0px';
  x += sticker(g, 'showcase', x, y - 2, 34) + 22;
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

// ----- their song: the video plays through Tamalume, and the page moves with it -----
// The visible player is the one Tamalume uses (window.TAMSONG), so the bar's
// play button and the video stay in step; Tamalume sets --syn-beat, --syn-bass
// and --syn-color on the page while it plays (YouTube's sound can't be read by
// the browser, so the lights follow the song's tempo).
const vbox = document.querySelector('.va-video[data-youtube]');
if (vbox) {
  let player;
  const vid = vbox.dataset.youtube;
  const ready = youtube().then((YT) => new Promise((resolve) => {
    player = new YT.Player(document.getElementById('va-player'), {
      videoId: vid, playerVars: { playsinline: 1, rel: 0 },
      events: {
        onReady: () => { window.TAMSONG = { play: () => player.playVideo(), pause: () => player.pauseVideo(), time: () => player.getCurrentTime() || 0 }; resolve(player); },
        onStateChange: (e) => {
          if (e.data === 1) { vbox.classList.add('playing'); document.body.classList.add('va-playing'); dispatchEvent(new Event('song:play')); signalOnce(SIG, 'play'); }
          if (e.data === 2 || e.data === 0) { document.body.classList.remove('va-playing'); dispatchEvent(new Event('song:pause')); }
        },
      },
    });
  }));
  vbox.querySelector('.vplay').addEventListener('click', async () => { vbox.classList.add('playing'); (await ready).playVideo(); });
  // the Tamalume bar's own play button starts the same video
  addEventListener('syn:start', () => document.body.classList.add('va-playing'));
  addEventListener('syn:stop', () => document.body.classList.remove('va-playing'));
}

// ----- their live clip: the page hears the real sound and moves with it -----
// The clip is on our own server, so the browser can analyse it (unlike a
// YouTube video): bass drives --syn-bass, a kick in the bass fires --syn-beat,
// and the loudest band picks the colour, the same variables Tamalume sets.
const clip = document.querySelector('video[data-hear]');
if (clip) {
  const root = document.documentElement.style;
  const COLS = ['#ff3ea5', '#d4ff3c', '#4d7cff', '#ffb347'];
  let ac, an, buf, raf, avg = 0, beat = 0, last = 0;
  const loop = () => {
    an.getByteFrequencyData(buf);
    const band = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += buf[i]; return s / (b - a) / 255; };
    const bass = band(1, 8), mid = band(8, 60), treb = band(60, 200);
    avg = avg * 0.92 + bass * 0.08;
    const t = performance.now();
    if (bass > avg * 1.25 && bass > 0.35 && t - last > 220) { beat = 1; last = t; }
    beat *= 0.88;
    root.setProperty('--syn-bass', bass.toFixed(2));
    root.setProperty('--syn-beat', beat.toFixed(2));
    root.setProperty('--syn-color', COLS[[bass, mid, treb].indexOf(Math.max(bass, mid, treb)) + (beat > 0.5 ? 1 : 0)] || COLS[0]);
    raf = requestAnimationFrame(loop);
  };
  clip.addEventListener('play', () => {
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        an = ac.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.6;
        buf = new Uint8Array(an.frequencyBinCount);
        const src = ac.createMediaElementSource(clip);
        src.connect(an); an.connect(ac.destination);
      }
      ac.resume();
      document.body.classList.add('va-playing');
      cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    } catch { /* plays without the lights */ }
  });
  const quiet = () => { cancelAnimationFrame(raf); document.body.classList.remove('va-playing'); root.setProperty('--syn-beat', '0'); root.setProperty('--syn-bass', '0'); };
  clip.addEventListener('pause', quiet); clip.addEventListener('ended', quiet);
}
