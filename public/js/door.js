// Door check-in: /door, and the panel on a ticket page when staff scan it.

import { $, api, pageData, pounds } from './lib.js';
import { signedIn } from './staff.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const panel = $('#door-panel');

function render(b) {
  panel.className = `door-panel ${b.ok ? 'yes' : 'no'}`;
  const left = b.qty - b.checkedIn;
  panel.innerHTML = `<div class="door-mark">${b.ok ? '✓' : '✗'}</div><h2>${esc(b.name)}</h2>
    <p>${esc(b.nightTitle)} · ${b.qty} × ${esc(b.ticketName || 'Ticket')} · ${b.checkedIn} in${b.reserved ? ' · <b>reserved, collect payment</b>' : ''}</p>
    ${b.problems.map((p) => `<p class="err">${esc(p)}</p>`).join('')}
    ${b.tableRequest ? `<p>Table request: ${esc(b.tableNote || 'yes')}</p>` : ''}
    <div class="row-btn" style="justify-content:center">
      ${b.ok && left > 1 ? `<button class="btn hot" data-n="${left}">Check in all ${left}</button>` : ''}
      ${b.ok ? '<button class="btn hot" data-n="1">Check in 1</button>' : ''}
      ${b.checkedIn ? '<button class="btn ghost" data-n="-1">Undo 1</button>' : ''}
    </div><p class="small muted">${esc(b.id)} · ${pounds(b.total)}</p>`;
  panel.onclick = async (e) => {
    const n = e.target.closest('[data-n]');
    if (!n) return;
    try { const r = await api('/api/door/checkin', { method: 'POST', body: { ref: b.id, count: Number(n.dataset.n) } }); render(r.booking); tonight(); }
    catch (err) { panel.insertAdjacentHTML('beforeend', `<p class="err">${esc(err.message)}</p>`); }
  };
}

async function lookup(ref, k) {
  try { const r = await api(`/api/door/lookup?${new URLSearchParams({ ref, ...(k ? { k } : {}) })}`); render(r.booking); }
  catch (err) { panel.className = 'door-panel no'; panel.innerHTML = `<div class="door-mark">✗</div><p>${esc(err.message)}</p>`; }
}

async function tonight() {
  if (!$('#door')) return;
  const t = await api('/api/door/tonight');
  $('#door-tonight').textContent = t.nights.length ? t.nights.join(' · ') : 'No TAM night tonight';
  $('#door-in').textContent = t.arrived; $('#door-expected').textContent = t.expected;
}

const { door } = pageData();
if (door && panel) {
  // a ticket page opened by a signed-in staff phone
  lookup(door.ref, door.k);
} else if ($('#door')) {
  signedIn(() => api('/api/door/tonight'), () => {
    $('#door').hidden = false;
    tonight(); setInterval(tonight, 30000);
    $('#door-lookup').addEventListener('submit', (e) => { e.preventDefault(); lookup(e.target.ref.value); });
    // In-page scanning where the browser has a barcode detector.
    if ('BarcodeDetector' in window && navigator.mediaDevices) {
      const btn = $('#door-scan'), video = $('#door-video');
      btn.hidden = false;
      btn.addEventListener('click', async () => {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream; video.hidden = false; await video.play();
        const scan = async () => {
          const codes = await det.detect(video).catch(() => []);
          const hit = codes.map((c) => c.rawValue).find((v) => /\/ticket\//.test(v));
          if (hit) {
            stream.getTracks().forEach((t) => t.stop()); video.hidden = true;
            const u = new URL(hit);
            return lookup(u.pathname.split('/').pop(), u.searchParams.get('k'));
          }
          requestAnimationFrame(scan);
        };
        scan();
      });
    }
  });
}
