// An act's own Sunday Showcase page: invite friends (the phone's share sheet
// where there is one, or WhatsApp, email, text, copy), and "I want to see them
// at the Christmas Showcase Special" (one vote per browser).

import { api } from './lib.js';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ----- invites -----
const share = document.querySelector('[data-share]');
if (share) {
  const { url, text, title } = share.dataset;
  const msg = document.querySelector('[data-share-msg]');
  const native = share.querySelector('[data-native]');
  if (navigator.share) {
    native.hidden = false;
    native.addEventListener('click', () => navigator.share({ title, text, url }).catch(() => {}));
  }
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
      document.body.classList.add('va-cheer'); setTimeout(() => document.body.classList.remove('va-cheer'), 1600);
    } catch (err) { want.disabled = false; count.textContent = err.message; }
  });
}
