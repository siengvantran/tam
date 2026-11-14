// The TAM Club's pages: /club (join, or your card), the emailed-link pages,
// unsubscribe, the card staff scan at the bar, the newsletter archive with
// its RSS feed, and the back office at /club/manage. The work happens in
// /js/club.js and /js/club-manage.js; the logic is in src/domain/club.js.

import { html, raw } from './html.js';
import { html as respond, redirect, send } from '../lib/http.js';
import { layout } from './layout.js';
import { INTERESTS, FREQUENCIES, RULES, HALF, TIERS, DRINK_LINE } from '../domain/club.js';
import { escape } from './html.js';

const page = (ctx, o) => layout(ctx, { ambient: 'stars', scripts: ['/js/club.js'], ...o });

// The pint glass: fills to the half-pint line as points come in (CSS var --fill).
export const glass = (fill = 0, label = '') => html`<div class="cl-glass" style="--fill:${Math.max(0, Math.min(1, fill))}" role="img" aria-label="${label}">
  <svg viewBox="0 0 120 170" aria-hidden="true"><defs><clipPath id="cl-pint"><path d="M14 8h92l-10 152a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6z"/></clipPath>
  <linearGradient id="cl-beer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd36b"/><stop offset="1" stop-color="#e88a1a"/></linearGradient></defs>
  <g clip-path="url(#cl-pint)"><rect class="cl-beer" x="0" y="0" width="120" height="170" fill="url(#cl-beer)"/><rect class="cl-foam" x="0" y="0" width="120" height="10" fill="#fff6e0"/></g>
  <path d="M14 8h92l-10 152a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6z" fill="none" stroke="currentColor" stroke-width="3"/>
  <line x1="18" y1="87" x2="102" y2="87" stroke="currentColor" stroke-dasharray="4 4" opacity=".6"/><text x="104" y="84" font-size="10" fill="currentColor" text-anchor="end" opacity=".8">½</text></svg></div>`;

const ways = () => Object.entries(RULES).filter(([, r]) => !r.hidden).map(([id, r]) => html`<li data-rule="${id}"><b>${r.unit ? `${r.pts}/£1` : `+${r.pts}`}</b><span>${r.label}${r.hint ? html` <small>${r.hint}</small>` : ''}</span></li>`);

function joinForm(ctx, { source = 'tam.tv', compact = false } = {}) {
  return html`<form class="cl-join ${compact ? 'compact' : ''}" data-club-join data-source="${source}">
    ${compact ? '' : html`<div class="fields"><label class="field"><span>First name</span><input name="name" autocomplete="given-name" maxlength="60"></label>
    <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label></div>
    <fieldset class="cl-chips"><legend>What are you into? <small>(+${RULES.profile.pts} points)</small></legend>
      ${Object.entries(INTERESTS).map(([k, v]) => html`<label class="cl-chip"><input type="checkbox" name="interests" value="${k}"><span>${v.label}</span></label>`)}</fieldset>
    <fieldset class="cl-chips"><legend>How often?</legend>
      ${Object.entries(FREQUENCIES).map(([k, v], i) => html`<label class="cl-chip"><input type="radio" name="frequency" value="${k}" ${i === 0 ? 'checked' : ''}><span>${v}</span></label>`)}</fieldset>`}
    ${compact ? html`<label class="field"><span class="sr">Email</span><input name="email" type="email" autocomplete="email" placeholder="Your email" required></label>` : ''}
    <label class="check"><input type="checkbox" name="consent" required> Yes, email me about nights at TAM and my TAM Club points. Unsubscribe any time. <a href="/privacy#club">Privacy</a></label>
    <button class="btn hot" type="submit">${compact ? 'Join' : 'Join the TAM Club'}</button>
    <p class="err" role="status" aria-live="polite"></p></form>`;
}
export { joinForm };

function clubPage(ctx, req) {
  const m = ctx.club.memberOf(req);
  const issues = ctx.club.archive().slice(0, 3);
  const top = m ? html`<section class="section cl-me"><div class="wrap"><div id="club-card" data-club-card><p class="muted">Loading your card…</p></div></div></section>` : html`
  <section class="section cl-hero"><div class="wrap cl-hero-grid">
    <div><div class="label">The TAM Club · free</div><h1 class="chrome gold">Get the list.<br>Drink on us.</h1>
    <p class="lede">TAM’s email, picked for what you’re into, and a card that fills up as you come to gigs, share nights and bring your friends. At <b>${HALF} points</b>, a drink is on the house at the TAM bar: ${DRINK_LINE}.</p>
    ${joinForm(ctx, { source: 'club page' })}
    <p class="small muted">Already in? <button class="linkish" type="button" data-club-signin>Email me my card</button></p></div>
    <div class="cl-hero-glass">${glass(0.62, 'A pint glass filling up to the half-pint line')}<p class="cl-glass-cap">Every round at the bar fills your glass.</p></div>
  </div></section>`;
  return page(ctx, {
    title: 'TAM Club: the list and your card', path: '/club',
    description: `Join TAM’s email list and earn points for gigs, shares and friends. ${HALF} points is a drink on the house at the TAM bar: ${DRINK_LINE}.`,
    body: html`${top}
    <section class="section"><div class="wrap cl-how">
      <div><h2 class="chrome">How it works</h2><ol class="cl-steps"><li><b>Join</b> and confirm your email: ${RULES.join.pts} points to start.</li><li><b>Fill your glass</b>, fastest by showing your card at the bar and booking on tam.tv.</li><li><b>Claim your drink</b> at ${HALF} points (${DRINK_LINE}) and show the code at the bar.</li></ol>
      <h3>Levels</h3><p class="cl-tiers">${TIERS.map((t) => html`<span>${t.name}<small>${t.at ? `${t.at}+ earned` : 'to start'}</small></span>`)}</p></div>
      <div>${m ? '' : html`<h2 class="chrome">Ways to earn</h2><ul class="cl-ways">${ways()}</ul>`}
      <p class="small muted">Fair play: daily limits apply, one drink a week, and a claimed drink is good for 30 days (unused points come back). Wine and beer are for over 18s: anyone else gets an infused water or a soft drink.</p></div>
    </div></section>
    <section class="section"><div class="wrap"><h2 class="chrome">In your inbox</h2>
      <div class="cl-perks"><div><b>What’s on, for you</b><p>Only the nights you’re into, every week, once a month or just the big news. You choose.</p></div>
      <div><b>First dibs</b><p>Hear about Christmas, showcases and sell-out nights before they’re everywhere.</p></div>
      <div><b>Your points</b><p>Every email shows how close you are to your drink on us.</p></div></div>
      ${issues.length ? html`<h3>Latest issues</h3><ul class="cl-archive">${issues.map((x) => html`<li><a href="/newsletter/${x.slug}">${x.title || x.subject}</a> <small>${String(x.sentAt).slice(0, 10)}</small></li>`)}</ul><p><a href="/newsletter">All issues</a> · <a href="/newsletter/feed.xml">RSS</a></p>` : ''}
    </div></section>`,
  });
}

const buttonPage = (ctx, title, path, id, intro, btn) => page(ctx, {
  title, path, noindex: true,
  body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome gold">${title}</h1>
  <div class="formbox" id="${id}"><p>${intro}</p><button class="btn hot" type="button">${btn}</button><p class="err" role="status" aria-live="polite"></p></div></div></section>`,
});

export function routes(r, ctx, qr) {
  r.get('/club', (req, res) => respond(res, clubPage(ctx, req), 200, { 'Cache-Control': 'no-store' }));
  r.get('/club/confirm', (req, res) => respond(res, buttonPage(ctx, 'Confirm your email', '/club/confirm', 'club-confirm', `One tap and you’re on the TAM list, with ${RULES.join.pts} points on your card.`, 'Yes, I’m in')));
  r.get('/club/in', (req, res) => respond(res, buttonPage(ctx, 'Your TAM Club card', '/club/in', 'club-in', 'Open your card on this device.', 'Open my card')));
  r.get('/club/unsubscribe', (req, res) => respond(res, page(ctx, {
    title: 'Your TAM emails', path: '/club/unsubscribe', noindex: true,
    body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome gold">Fewer emails, or none?</h1>
    <div class="formbox" id="club-unsub"><p>You can hear from us less, or stop TAM’s emails altogether. Your TAM Club card and points stay either way.</p>
    <div class="row-btn"><button class="btn ghost" type="button" data-act="monthly">Once a month</button><button class="btn ghost" type="button" data-act="big">Only big news</button><button class="btn hot" type="button" data-act="stop">Unsubscribe</button></div>
    <p class="err" role="status" aria-live="polite"></p></div></div></section>`,
  })));
  r.get('/r/:code', (req, res, { params, url }) => {
    const to = url.searchParams.get('to') || '';
    const path = /^\/(?!\/)[\w\-/.#?=&%]*$/.test(to) ? to : '/club';
    const m = ctx.club.byRef(params.code);
    if (!m) return redirect(res, path);
    redirect(res, `${path}${path.includes('?') ? '&' : '?'}r=${encodeURIComponent(m.refCode)}`);
  });
  r.get('/club/card/:card/qr.svg', (req, res, { params }) => {
    const m = ctx.club.byCard(params.card);
    if (!m) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    res.end(qr.toSvg(`${ctx.cfg.siteUrl}/club/card/${m.card}`));
  });
  r.get('/club/card/:card', (req, res, { params }) => {
    const m = ctx.club.byCard(params.card);
    const p = m && ctx.club.publicCard(m);
    respond(res, page(ctx, {
      title: 'TAM Club card', path: `/club/card/${params.card}`, noindex: true,
      body: html`<section class="section"><div class="wrap narrow">${p ? html`
        <div class="cl-mini"><div class="label">TAM Club card</div><h1 class="chrome gold">${p.firstName || 'TAM Club member'}</h1><p class="cl-tier">${p.tier}${p.badges.length ? html` · ${p.badges.map((b) => b.icon).join(' ')}` : ''}</p></div>
        <div id="club-staff" data-card="${m.card}"></div>
        <p class="small muted">Staff: sign in on <a href="/door">the door page</a> on this phone to add points and pour drinks.</p>`
        : html`<h1 class="chrome">That card isn’t here</h1><p><a href="/club">Join the TAM Club</a>.</p>`}</div></section>`,
    }), p ? 200 : 404);
  });

  // the archive
  r.get('/newsletter', (req, res) => {
    const list = ctx.club.archive();
    respond(res, page(ctx, {
      title: 'The TAM newsletter', path: '/newsletter', description: 'Every issue of TAM’s newsletter: what’s on, new acts and news from the Temple of Art and Music.',
      body: html`<section class="section"><div class="wrap narrow"><div class="label">The TAM newsletter</div><h1 class="chrome gold">Every issue</h1>
      <p>Get the next one in your inbox, and points toward a drink on us. <a href="/club">Join the TAM Club</a> · <a href="/newsletter/feed.xml">RSS</a></p>
      ${list.length ? html`<ul class="cl-archive big">${list.map((x) => html`<li><a href="/newsletter/${x.slug}">${x.title || x.subject}</a><small>${String(x.sentAt).slice(0, 10)}</small>${x.preheader ? html`<p>${x.preheader}</p>` : ''}</li>`)}</ul>` : html`<p class="muted">The first issue is on its way.</p>`}
      ${joinForm(ctx, { source: 'newsletter archive', compact: true })}</div></section>`,
    }));
  });
  r.get('/newsletter/feed.xml', (req, res) => {
    const base = ctx.cfg.siteUrl;
    const items = ctx.club.archive().slice(0, 30).map((x) => `<item><title>${escape(x.title || x.subject)}</title><link>${base}/newsletter/${x.slug}</link><guid>${base}/newsletter/${x.slug}</guid><pubDate>${new Date(x.sentAt).toUTCString()}</pubDate><description>${escape(x.preheader || '')}</description></item>`).join('');
    send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>The TAM newsletter</title><link>${base}/newsletter</link><description>News and nights from the Temple of Art and Music</description>${items}</channel></rss>`,
      { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' });
  });
  r.get('/newsletter/:slug', (req, res, { params }) => {
    const x = ctx.club.archive().find((y) => y.slug === params.slug);
    if (!x) return respond(res, page(ctx, { title: 'Not found', noindex: true, body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome">That issue isn’t here</h1><p><a href="/newsletter">Every issue</a></p></div></section>` }), 404);
    const out = ctx.club.render(x, null, { track: false });
    respond(res, page(ctx, {
      title: x.title || x.subject, path: `/newsletter/${x.slug}`, description: x.preheader || undefined,
      body: html`<section class="section"><div class="wrap narrow"><p class="label"><a href="/newsletter">The TAM newsletter</a> · ${String(x.sentAt).slice(0, 10)}</p>
      <article class="nl-issue">${raw(out.inner)}</article>
      <div class="formbox"><h2>Get the next one</h2>${joinForm(ctx, { source: 'newsletter issue', compact: true })}</div></div></section>`,
    }));
  });

  // the back office
  r.get('/club/manage', (req, res) => respond(res, layout(ctx, {
    title: 'TAM Club and newsletter', path: '/club/manage', noindex: true, ambient: null, scripts: ['/js/club-manage.js'], bodyClass: 'staff',
    body: html`<section class="section"><div class="wrap wide"><div class="shows-top"><div><div class="label">TAM back office</div><h1 class="chrome gold">TAM Club and newsletter</h1></div><div id="cm-who" class="small muted"></div></div>
    <div class="formbox" id="team-login" hidden><h3>Sign in</h3><p class="small muted">Type your work email and we’ll send you a one-tap sign-in link.</p>
    <form id="team-link"><input type="hidden" name="next" value="/club/manage"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
    <button class="btn hot" type="submit">Email me a link</button><p class="err" role="status" aria-live="polite"></p></form>
    <details class="small"><summary>Use the admin code instead</summary><form id="team-code"><label class="field"><span>Code</span><input name="token" type="password" autocomplete="current-password" required></label>
    <button class="btn ghost" type="submit">Sign in</button><p class="err" role="status" aria-live="polite"></p></form></details></div>
    <div id="cm" hidden></div></div></section>`,
  })));
}
