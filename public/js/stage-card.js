// The TAM Stage poster maker: an act (or a fan) makes a poster or a card for
// the act's page, to share with friends, fans and family so they pledge to see
// the act live. Drawn in the browser on a canvas: an Instagram story, a post,
// or an A4 poster to print, with the act's photo and a QR code to their page.

const FORMATS = {
  story: { w: 1080, h: 1920, label: 'Story', note: 'Instagram, TikTok and WhatsApp stories' },
  post: { w: 1080, h: 1350, label: 'Post', note: 'Instagram and Facebook posts' },
  poster: { w: 1240, h: 1754, label: 'A4 poster', note: 'Print it for the venue, college or café' },
};
const C = { bg1: '#1d0b22', bg2: '#06030a', gold: '#e8c77a', pink: '#ff2e88', ink: '#f6ecd8', dim: '#c9b9a2', violet: '#8a2be2' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (src) => new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

function cardData() {
  if (window.tamCardData) return window.tamCardData;
  const el = document.getElementById('st-card-data');
  try { return el ? JSON.parse(el.textContent) : null; } catch { return null; }
}

// text that fits: shrink to the width, wrap to at most `lines`
function fit(g, text, font, size, maxW, lines = 2, min = 0.45) {
  let s = size;
  for (; s > size * min; s -= 2) {
    g.font = font(s);
    const words = String(text).split(/\s+/);
    const out = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width <= maxW) line = t;
      else { if (line) out.push(line); line = w; }
    }
    if (line) out.push(line);
    if (out.length <= lines && out.every((l) => g.measureText(l).width <= maxW)) return { size: s, lines: out };
  }
  g.font = font(s);
  return { size: s, lines: [String(text)] };
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function cover(g, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 3, sw, sh, x, y, w, h);
}

async function draw(canvas, d, fmt) {
  const { w: W, h: H } = FORMATS[fmt];
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  try { await Promise.all([document.fonts.load('80px "Bebas Neue"'), document.fonts.load('600 40px Inter'), document.fonts.load('italic 40px "DM Serif Display"')]); } catch { /* system fonts */ }
  const [photo, qr, logo] = await Promise.all([load(d.photo), load(`/live/qr.svg?u=${encodeURIComponent(`${d.url}#pledge`)}`), load('/img/tam-mark.png')]);
  const pad = Math.round(W * 0.07);
  const display = (s) => `${s}px "Bebas Neue", Impact, sans-serif`;
  const body = (s, wt = 500) => `${wt} ${s}px Inter, system-ui, sans-serif`;
  const serif = (s) => `italic ${s}px "DM Serif Display", Georgia, serif`;

  // night sky
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, C.bg1); bg.addColorStop(1, C.bg2);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.8, H * 0.15, 0, W * 0.8, H * 0.15, W * 0.9); glow.addColorStop(0, 'rgba(255,46,136,.28)'); glow.addColorStop(1, 'rgba(255,46,136,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  let seed = [...d.slug].reduce((t, c) => (t * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = 'rgba(246,236,216,.7)';
  for (let i = 0; i < 140; i++) { g.beginPath(); g.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 2.4, 0, Math.PI * 2); g.fill(); }

  // the top line
  let y = pad;
  if (logo) g.drawImage(logo, pad, y - 6, 72, 72);
  g.fillStyle = C.gold; g.font = body(26, 700); g.textBaseline = 'middle';
  g.fillText('THE TAM STAGE', pad + (logo ? 92 : 0), y + 30);
  g.textAlign = 'right'; g.fillStyle = C.dim; g.font = body(24, 500);
  g.fillText('tam.tv', W - pad, y + 30); g.textAlign = 'left';
  y += 100;

  // measure the words first: the photo takes the room that's left above the QR
  const q = Math.round(Math.min(W, H) * (fmt === 'post' ? 0.2 : 0.24));
  const qy = H - pad - q;
  const name = fit(g, d.act.toUpperCase(), display, fmt === 'story' ? 190 : 150, W - pad * 2, 2);
  const p = d.plays ? fit(g, d.plays, serif, 46, W - pad * 2, 1, 0.6) : null;
  const ask = fit(g, `Pledge to see ${d.act} live at TAM`, (s) => body(s, 700), fmt === 'post' ? 50 : 58, W - pad * 2, 2, 0.6);
  const sub = d.paths && d.paths.length ? `Help them get booked: ${d.paths.join(' · ')}` : `On the TAM Stage: ${d.planet}${d.next ? `, on the way to ${d.next}` : ''}`;
  const sb = fit(g, sub, body, 32, W - pad * 2, 2, 0.7);
  const gap = Math.round(H * 0.03);
  const textH = name.lines.length * name.size * 0.88 + (p ? p.size * 1.45 : 0) + gap * 1.4 + ask.lines.length * ask.size * 1.15 + sb.lines.length * sb.size * 1.35;
  const ph = Math.max(Math.round(H * 0.18), Math.min(Math.round(H * 0.5), Math.round(qy - gap * 1.5 - y - gap - textH)));

  // the photo (or a little microverse)
  g.save(); roundRect(g, pad, y, W - pad * 2, ph, 28); g.clip();
  if (photo) cover(g, photo, pad, y, W - pad * 2, ph);
  else {
    const cx = W / 2, cy = y + ph / 2;
    g.fillStyle = '#12081a'; g.fillRect(pad, y, W - pad * 2, ph);
    g.strokeStyle = 'rgba(232,199,122,.45)'; g.lineWidth = 3;
    for (let i = 1; i <= 6; i++) { g.beginPath(); g.arc(cx, cy, ph * 0.07 * i, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = C.pink; g.beginPath(); g.arc(cx, cy, ph * 0.05, 0, Math.PI * 2); g.fill();
  }
  const fade = g.createLinearGradient(0, y + ph * 0.6, 0, y + ph); fade.addColorStop(0, 'rgba(6,3,10,0)'); fade.addColorStop(1, 'rgba(6,3,10,.75)');
  g.fillStyle = fade; g.fillRect(pad, y, W - pad * 2, ph);
  g.restore();
  g.strokeStyle = 'rgba(232,199,122,.6)'; g.lineWidth = 3; roundRect(g, pad, y, W - pad * 2, ph, 28); g.stroke();
  y += ph + gap;

  // the act
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.ink; g.font = display(name.size);
  for (const l of name.lines) { y += name.size * 0.88; g.fillText(l, pad, y); }
  if (p) { y += p.size * 1.45; g.fillStyle = C.gold; g.font = serif(p.size); g.fillText(p.lines[0], pad, y); }

  // the ask
  y += gap;
  g.fillStyle = C.pink;
  for (const l of ask.lines) { y += ask.size * 1.15; g.font = body(ask.size, 700); g.fillText(l, pad, y); }
  y += gap * 0.4;
  g.fillStyle = C.dim;
  for (const l of sb.lines) { y += sb.size * 1.35; g.font = body(sb.size, 500); g.fillText(l, pad, y); }

  // the QR, at the foot
  g.fillStyle = '#fff'; roundRect(g, pad, qy, q, q, 18); g.fill();
  if (qr) g.drawImage(qr, pad + 10, qy + 10, q - 20, q - 20);
  const tx = pad + q + 36;
  g.fillStyle = C.ink; g.font = display(72); g.fillText('SCAN TO PLEDGE', tx, qy + q * 0.42);
  g.fillStyle = C.gold; g.font = body(30, 600);
  const short = d.url.replace(/^https?:\/\/(www\.)?/, '');
  const u = fit(g, short, (s) => body(s, 600), 30, W - tx - pad, 1, 0.6);
  g.font = body(u.size, 600); g.fillText(u.lines[0], tx, qy + q * 0.62);
  if (d.pledged > 0) { g.fillStyle = C.dim; g.font = body(28, 500); g.fillText(`${d.pledged} pledged so far`, tx, qy + q * 0.84); }
}

let dlg = null;
async function open() {
  const d = cardData();
  if (!d) return;
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'st-card-dlg';
    dlg.innerHTML = `<form method="dialog" class="st-card-top"><h2>Make a poster</h2><button class="sh-x" aria-label="Close">×</button></form>
      <div class="st-card-tabs" role="group" aria-label="Size">${Object.entries(FORMATS).map(([k, f], i) => `<button type="button" data-fmt="${k}" class="${i ? '' : 'on'}">${f.label}</button>`).join('')}</div>
      <p class="small muted" data-note></p><canvas aria-label="Your poster"></canvas>
      <div class="row-btn"><button class="btn hot" type="button" data-save>Download</button><button class="btn ghost" type="button" data-share-card hidden>Share</button></div>
      <p class="small muted" data-msg role="status" aria-live="polite"></p>`;
    document.body.append(dlg);
  }
  let fmt = 'story';
  const canvas = dlg.querySelector('canvas');
  const msg = dlg.querySelector('[data-msg]');
  const render = async () => { dlg.querySelector('[data-note]').textContent = FORMATS[fmt].note; msg.textContent = ''; await draw(canvas, d, fmt); };
  const blob = () => new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  const name = () => `${d.slug}-tam-${fmt}.png`;
  const counted = () => fetch(`/api/stage/${encodeURIComponent(d.slug)}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ poster: true }) }).catch(() => {});
  dlg.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.fmt) { fmt = b.dataset.fmt; dlg.querySelectorAll('[data-fmt]').forEach((x) => x.classList.toggle('on', x === b)); await render(); }
    if (b.hasAttribute('data-save')) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(await blob()); a.download = name(); a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      msg.innerHTML = `Saved. Post it with your link: <b>${esc(d.url)}</b>`;
      counted();
    }
    if (b.hasAttribute('data-share-card')) {
      try { await navigator.share({ files: [new File([await blob()], name(), { type: 'image/png' })], text: `Pledge to see ${d.act} live at TAM: ${d.url}` }); counted(); } catch { /* cancelled */ }
    }
  };
  try { dlg.querySelector('[data-share-card]').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })); } catch { /* no file sharing */ }
  dlg.showModal();
  await render();
}

document.addEventListener('click', (e) => { if (e.target.closest('[data-poster]')) { e.preventDefault(); open(); } });
window.tamPoster = open;
