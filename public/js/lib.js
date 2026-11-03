// Small helpers shared by the page scripts.

export { pounds } from '/shared/pricing.js';
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function pageData() {
  const el = document.getElementById('page-data');
  try { return el ? JSON.parse(el.textContent) : {}; } catch { return {}; }
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(path, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `Something went wrong (${res.status}).`);
  return data;
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem(`tam:${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`tam:${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

// Shrink a photo in the browser before upload: longest side `max`, JPEG.
export function shrinkImage(file, max = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error('Choose an image file.'));
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL(file.type === 'image/png' && max <= 600 ? 'image/png' : 'image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('That image couldn’t be read.'));
    img.src = URL.createObjectURL(file);
  });
}

export function formMessage(form, text, good = false) {
  const el = form.querySelector('.err');
  if (el) { el.textContent = text; el.classList.toggle('good', good); }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// Loads the YouTube IFrame API once.
let ytReady;
export function youtube() {
  if (!ytReady) {
    ytReady = new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve(window.YT);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return ytReady;
}

// Tamalume's colour for each note (C, C♯, D … B): the same light everywhere on the site.
export const NOTE_COLOURS = ['#ff3030', '#9b30ff', '#ffe500', '#d0609a', '#7fe8ff', '#d0104a', '#5a84ff', '#ff8a00', '#c27bff', '#3ddc5a', '#c0708e', '#5fb8ff'];

// The one writer of the music variables (--syn-bass, --syn-beat, --syn-color…)
// that CSS reacts to. Each write restyles the page, so: at most 20 times a
// second, in coarse steps, and only when something actually changed. (Writing
// them every frame made Safari on iPhone run out of memory mid-song.)
const synLast = {};
let synAt = 0;
export function setSyn(vals, force = false) {
  const now = performance.now();
  if (!force && now - synAt < 50) return;
  synAt = now;
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(vals)) {
    if (v === undefined || v === null) continue;
    const out = typeof v === 'number' ? (Math.round(v * 10) / 10).toFixed(1) : v;
    if (synLast[k] === out) continue;
    synLast[k] = out;
    root.setProperty(`--syn-${k}`, out);
  }
}
