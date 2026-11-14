// The Analogue Room's invitation, on every public page: one line asking the
// visitor to today's room, worded for where they came from and who they are.
//
// Where they came from is worked out here, once a visit, from the address they
// arrived with (utm_source) or the site that sent them, as a kind only
// (search, social, email…). It is kept for the visit in sessionStorage and
// sent with totals-only counts (/api/room/signal). No cookie, nothing personal.

import { api, store } from '/js/lib.js';

const KINDS = [
  ['email', /newsletter|email|resend|mailchimp|buttondown/],
  ['ai', /chatgpt|openai|perplexity|claude|gemini|copilot/],
  ['search', /google|bing|duckduckgo|yahoo|ecosia|brave|startpage/],
  ['social', /instagram|facebook|fb\.|tiktok|twitter|t\.co|x\.com|youtube|youtu\.be|linkedin|threads|whatsapp|reddit|bsky/],
  ['tickets', /eventbrite|dice\.fm|skiddle|songkick|ticket/],
  ['tam', /tam\.tv|mercatometropolitano/],
];
export function classify({ utm = '', medium = '', referrer = '', host = '' }) {
  utm = utm.toLowerCase(); medium = medium.toLowerCase();
  if (medium === 'email') return 'email';
  let from = '';
  try { from = referrer ? new URL(referrer).hostname.toLowerCase() : ''; } catch { /* not a URL */ }
  if (from === host) from = ''; // moving around tam.tv isn't arriving
  const hit = (s) => (s ? (KINDS.find(([, re]) => re.test(s)) || ['other'])[0] : '');
  return hit(utm) || hit(from) || 'direct';
}

const session = {
  get(k) { try { return sessionStorage.getItem(`tam:${k}`) || ''; } catch { return ''; } },
  set(k, v) { try { sessionStorage.setItem(`tam:${k}`, v); } catch { /* private mode */ } },
};

// This visit: where it came from, and the invitation it followed (if any).
export function visit() {
  let src = session.get('src');
  if (!src) {
    const q = new URLSearchParams(location.search);
    src = classify({ utm: q.get('utm_source') || '', medium: q.get('utm_medium') || '', referrer: document.referrer, host: location.hostname });
    session.set('src', src);
  }
  return { src, variant: session.get('room-variant') || 'none', aud: session.get('room-aud') || undefined };
}
export function signal(type, extra = {}) {
  try {
    fetch('/api/room/signal', { method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ type, page: location.pathname, ...visit(), ...extra }) }).catch(() => {});
  } catch { /* offline */ }
}
function once(key, fn) { if (session.get(key)) return; session.set(key, '1'); fn(); }
function follow(variant, aud) { session.set('room-variant', variant); session.set('room-aud', aud); signal('click', { variant, aud }); }

const playedToday = (date) => { const s = store.get('room', null); return Boolean(s && s.runs && s.runs[date] && s.runs[date].open); };

// The home page has its own tile: count it like an invitation.
const tile = document.querySelector('[data-room-tile]');
if (tile) {
  const aud = tile.dataset.aud === 'artist' ? 'artist' : 'public';
  once('room-shown', () => signal('shown', { variant: 'home', aud }));
  const cta = tile.querySelector('[data-room-cta]');
  if (cta) cta.addEventListener('click', () => follow('home', aud));
}

async function invite() {
  const main = document.getElementById('main');
  if (!main || tile || location.pathname.startsWith('/analogue-room') || session.get('room-dismissed')) return;
  let got;
  try { got = await api(`/api/room/invite?src=${encodeURIComponent(visit().src)}&page=${encodeURIComponent(location.pathname)}`); } catch { return; }
  const v = got && got.invite;
  if (!v || playedToday(v.date)) return;
  const bar = document.createElement('aside');
  bar.className = 'ar-invite';
  bar.setAttribute('aria-label', 'Today’s escape room');
  const p = document.createElement('p'); p.textContent = v.text;
  const a = document.createElement('a'); a.className = 'btn hot small'; a.href = v.href; a.textContent = v.cta;
  const x = document.createElement('button'); x.type = 'button'; x.className = 'ar-x'; x.setAttribute('aria-label', 'Not now'); x.textContent = '×';
  a.addEventListener('click', () => follow(v.id, v.aud));
  x.addEventListener('click', () => { session.set('room-dismissed', '1'); bar.remove(); });
  bar.append(p, a, x);
  main.before(bar);
  once('room-shown', () => signal('shown', { variant: v.id, aud: v.aud }));
}
invite();
