// Google Analytics or Google Tag Manager, only with consent. Nothing from
// Google loads until a visitor says yes on the banner; "No thanks" is
// remembered too (and removes any Google Analytics cookies), and either can be
// changed from "Cookie choices" in the footer.
//
// The page carries the ID from the server: data-gtm (GTM_ID, a Tag Manager
// container) or data-ga (GA_MEASUREMENT_ID, GA4 directly). Without one, no banner.
//
// Pages report what visitors do with window.tamTrack(event, params). With Tag
// Manager it goes into the dataLayer as { event, ...params } (e.g.
// "showcase_view" with act), for a GA4 event tag in the container to pick up;
// with GA4 directly it's sent as a gtag event. Before a yes it's dropped.

const root = document.documentElement;
const gtm = root.dataset.gtm, ga = root.dataset.ga;
const KEY = 'tam:analytics';
const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const set = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };
let on = false;
const queue = [];

window.tamTrack = (event, params = {}) => {
  if (!on) { queue.push([event, params]); if (queue.length > 50) queue.shift(); return; }
  if (gtm) window.dataLayer.push({ event, ...params });
  else if (window.gtag) window.gtag('event', event, params);
};

function start() {
  if (on || !(gtm || ga)) return;
  on = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  const s = document.createElement('script'); s.async = true;
  if (gtm) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`;
  } else {
    window.gtag('js', new Date());
    window.gtag('config', ga, { anonymize_ip: true });
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`;
  }
  document.head.append(s);
  queue.splice(0).forEach(([e, p]) => window.tamTrack(e, p));
}

function forget() {
  // take back any Google Analytics cookies from an earlier yes
  document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^_ga|^_gid$/.test(n)).forEach((n) => {
    for (const d of ['', location.hostname, `.${location.hostname.replace(/^www\./, '')}`]) document.cookie = `${n}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
  });
}

function banner() {
  if (document.getElementById('cookie-banner')) return;
  const b = document.createElement('div');
  b.id = 'cookie-banner'; b.className = 'cookie-banner'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookie choices');
  b.innerHTML = `<p>Can we use Google Analytics cookies to see which artists and pages people enjoy? It helps us build better nights. <a href="/privacy#analytics">More</a></p>
    <div><button type="button" class="btn hot small" data-yes>Yes, that's fine</button><button type="button" class="btn ghost small" data-no>No thanks</button></div>`;
  b.addEventListener('click', (e) => {
    if (e.target.closest('[data-yes]')) { set('yes'); b.remove(); start(); }
    if (e.target.closest('[data-no]')) { set('no'); b.remove(); forget(); }
  });
  document.body.append(b);
}

if (gtm || ga) {
  const choice = get();
  if (choice === 'yes') start(); else if (choice !== 'no') banner();
  document.addEventListener('click', (e) => { if (e.target.closest('[data-cookie-choices]')) { e.preventDefault(); banner(); } });
}
