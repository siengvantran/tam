// The raffle desk: sell numbered tickets, void a sale, draw winners.

import { rafflePrice } from '/shared/pricing.js';
import { $, api, pounds, formMessage } from './lib.js';
import { signedIn } from './staff.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let raffle = null;

function render(s) {
  raffle = s.raffle || null;
  $('#r-night').textContent = s.nightLabel;
  $('#r-sold').textContent = s.sold;
  $('#r-takings').textContent = `${pounds(s.takings)} (cash ${pounds(s.cash)}, card ${pounds(s.card)})`;
  $('#r-recent').innerHTML = s.recent.map((x) => `<li>${x.void ? '<s>' : ''}No. ${x.from}–${x.to} · ${x.count} for ${pounds(x.amount)} · ${x.method}${x.name ? ` · ${esc(x.name)}` : ''}${x.void ? '</s> void' : ` <button class="btn ghost small" data-void="${x.id}">Void</button>`}</li>`).join('');
  $('#r-draws').innerHTML = s.draws.map((d) => `<li><b>No. ${d.number}</b> wins ${esc(d.prize)}${d.name ? ` · ${esc(d.name)}` : ''}</li>`).join('');
  price();
}
function price() {
  const n = Number($('#r-sell').count.value);
  $('#r-price').textContent = raffle && n > 0 ? `${n} tickets: ${pounds(rafflePrice(n, raffle))}` : '';
}

signedIn(() => api('/api/raffle/tonight'), (s) => {
  $('#raffle').hidden = false;
  render(s);
  const sell = $('#r-sell');
  sell.addEventListener('input', price);
  sell.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/raffle/sell', { method: 'POST', body: { count: Number(sell.count.value), name: sell.name.value, method: e.submitter.value } });
      $('#r-last').hidden = false;
      $('#r-last').innerHTML = `<h3>Numbers ${r.sale.from} to ${r.sale.to}</h3><p>Take ${pounds(r.sale.amount)} by ${r.sale.method}.</p>`;
      sell.name.value = ''; formMessage(sell, ''); render(r);
    } catch (err) { formMessage(sell, err.message); }
  });
  $('#r-recent').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-void]');
    if (!b || !confirm('Void this sale? Its numbers won’t be reused.')) return;
    try { render(await api('/api/raffle/void', { method: 'POST', body: { id: b.dataset.void } })); } catch (err) { alert(err.message); }
  });
  const draw = $('#r-draw');
  draw.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const r = await api('/api/raffle/draw', { method: 'POST', body: { prize: draw.prize.value } }); render(r); formMessage(draw, `No. ${r.draw.number} wins!`, true); draw.prize.value = ''; }
    catch (err) { formMessage(draw, err.message); }
  });
});
