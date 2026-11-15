// The big screen (/screen): every 15 seconds, fresh counts; every 9 seconds,
// the next act in the spotlight, with a QR to follow and back them.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const night = document.body.dataset.night;
let S = null, i = 0, shown = 0;

function countTo(el, to) {
  const from = Number(el.textContent) || 0;
  if (from === to) return;
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump');
}

function spotlight() {
  const list = (S && S.acts) || [];
  if (!list.length) return;
  const a = list[i % list.length];
  i++;
  const qr = a.href ? `/live/qr.svg?u=${encodeURIComponent(a.href)}` : '';
  const box = $('#lv-spot');
  box.classList.remove('in');
  setTimeout(() => {
    box.innerHTML = `<div class="lv-card">
      <div class="lv-pic">${a.photo ? `<img src="${esc(a.photo)}" alt="">` : `<span>${esc(a.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join(''))}</span>`}</div>
      <div class="lv-info"><div class="lv-k">${esc(a.group || 'On stage today')}</div><h2>${esc(a.name)}</h2>
        <p class="lv-stats"><span>💛 <b>${a.here}</b> here for them</span>${a.jom ? `<span>🎄 <b>${a.pledges}</b> pledged for Christmas</span>` : ''}</p>
        ${qr ? `<div class="lv-follow"><img src="${qr}" alt=""><div><b>Follow ${esc(a.name)}</b><span>${a.jom ? 'and pledge to see them at The Best Christmas Ever' : 'and see where they play next'}</span>${a.short ? `<small>${esc(a.short)}</small>` : ''}</div></div>` : ''}</div></div>`;
    box.classList.add('in');
  }, shown++ ? 450 : 0);
}

async function load() {
  try {
    S = await (await fetch(`/api/live${night ? `?night=${encodeURIComponent(night)}` : ''}`, { cache: 'no-store' })).json();
    countTo($('#lv-people'), S.people);
    const c = $('#lv-crowd .lv-crowd-list');
    c.innerHTML = S.crowd.length ? S.crowd.map((x, k) => `<span class="lv-rank"><i>${k + 1}</i>${esc(x.name)} <b>${x.here}</b></span>`).join('') : 'Check in to put your act on the board';
    if (!shown) spotlight();
  } catch { /* the screen keeps what it has */ }
}

load();
setInterval(load, 15000);
setInterval(spotlight, 9000);
// F for full screen; B uses the whole screen when the stage is clear (it starts in the top band); the cursor hides when idle
addEventListener('keydown', (e) => { if (e.key === 'b' || e.key === 'B') { document.body.classList.toggle('full'); return; } if (e.key === 'f' || e.key === 'F') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); });
let idle; addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 2500); });
