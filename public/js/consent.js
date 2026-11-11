// Google Analytics, only with consent. Nothing from Google loads until a
// visitor says yes on the banner; "No thanks" is remembered too, and either
// can be changed from "Cookie choices" in the footer. The measurement ID comes
// from the page (GA_MEASUREMENT_ID on the server); without one, no banner.
//
// Pages report what visitors do with window.tamTrack(event, params): sent to
// Google Analytics when allowed, and dropped otherwise.

const id = document.documentElement.dataset.ga;
const KEY = 'tam:analytics';
const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const set = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };
const queue = [];
window.tamTrack = (event, params = {}) => { if (window.gtag) window.gtag('event', event, params); else queue.push([event, params]); if (queue.length > 50) queue.shift(); };

function start() {
  if (!id || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true });
  const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(s);
  queue.splice(0).forEach(([e, p]) => window.gtag('event', e, p));
}

function banner() {
  if (document.getElementById('cookie-banner')) return;
  const b = document.createElement('div');
  b.id = 'cookie-banner'; b.className = 'cookie-banner'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookie choices');
  b.innerHTML = `<p>Can we use Google Analytics cookies to see which artists and pages people enjoy? It helps us build better nights. <a href="/privacy#analytics">More</a></p>
    <div><button type="button" class="btn hot small" data-yes>Yes, that's fine</button><button type="button" class="btn ghost small" data-no>No thanks</button></div>`;
  b.addEventListener('click', (e) => {
    if (e.target.closest('[data-yes]')) { set('yes'); b.remove(); start(); }
    if (e.target.closest('[data-no]')) {
      set('no'); b.remove();
      // take back any Google Analytics cookies from an earlier yes
      document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^_ga/.test(n)).forEach((n) => {
        for (const d of ['', location.hostname, `.${location.hostname.replace(/^www\./, '')}`]) document.cookie = `${n}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
      });
    }
  });
  document.body.append(b);
}

if (id) {
  const choice = get();
  if (choice === 'yes') start(); else if (choice !== 'no') banner();
  document.addEventListener('click', (e) => { if (e.target.closest('[data-cookie-choices]')) { e.preventDefault(); banner(); } });
}
