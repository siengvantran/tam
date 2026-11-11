// TAM Sunday Showcases: a call-out for artists who want to play a future
// showcase. The way in is TAM's open mic circuit: come to an open night, meet
// the host, then register your interest (it lands in /admin as an enquiry,
// kind "perform", and is emailed to the box office). Words and the circuit
// are in content/showcases.json; the dates come live from the listings.

import { html } from './html.js';
import { html as respond, redirect } from '../lib/http.js';
import { layout, when, times, nightHref } from './layout.js';
import { bookingData, bookingSection } from './sections.js';
import { onMap, TAM } from '../lib/places.js';
import { VIBE_MARKS } from '../domain/showcases.js';

const vibeMark = (a, cls = 'va-vibe') => { const [name, sign] = VIBE_MARKS[a.vibe] || VIBE_MARKS.stage; return html`<span class="${cls} vibe-${a.vibe || 'stage'}" title="${name}"><i aria-hidden="true">${sign}</i><b>${name}</b></span>`; };

const PATH = '/sunday-showcases';

// Lights on The Best Christmas Ever's Shard tree: [left %, top %, colour, delay s], inside its outline.
const LIGHTS = [[50, 8, 'w', 0], [47, 18, 'r', .6], [54, 24, 'g', 1.1], [44, 31, 'w', .3], [57, 35, 'r', 1.6], [40, 42, 'g', .9], [52, 45, 'w', 2.1], [61, 50, 'w', .2],
  [36, 55, 'r', 1.3], [48, 58, 'g', .5], [65, 62, 'r', 1.8], [31, 67, 'w', .7], [55, 68, 'w', 1.4], [42, 74, 'r', .1], [70, 76, 'g', 1.0], [26, 80, 'g', 1.7],
  [50, 82, 'w', .4], [62, 86, 'r', 2.2], [20, 90, 'w', .8], [38, 92, 'g', 1.5], [76, 92, 'w', .25], [56, 95, 'r', 1.2]];
const shardTree = (cls = '') => html`<div class="sc-shard ${cls}" aria-hidden="true">
  <img class="sc-star" src="/img/christmas/tam-logo-gold.png" alt="" width="120" height="120">
  <div class="sc-shard-body"><img src="/img/christmas/shard-tree-tip.png" alt="" width="720" height="1272">
  ${LIGHTS.map(([x, y, c, d]) => html`<span class="sc-light ${c}" style="left:${x}%;top:${y}%;animation-delay:${d}s"></span>`)}</div></div>`;

// The line-up as a futuristic 3D carousel (public/js/carousel.js, as the featured
// show's): one slide per act, a live clip where there is one; acts still to be
// named are a mystery slide. Tapping an act opens its own page.
// base: where the tree is (empty on the showcases page itself; '/sunday-showcases' elsewhere, e.g. the home page).
export function lineupCarousel(l, { base = '' } = {}) {
  const named = l.acts.filter((a) => !a.tba);
  if (!named.length) return '';
  const label = (a) => (a.tba ? `Act ${a.n} · to be announced` : `Act ${a.n} · ${a.name}${a.plays ? ` · ${a.plays}` : ''}`);
  const href = (a) => (a.tba ? `${base}#this-sunday` : a.href);
  const clip = (a) => (a.media || []).find((m) => m.type === 'video');
  return html`<section class="fx-hero sc-fx" id="line-up" aria-label="${l.when}: the line-up">
  <div class="fx-grid" aria-hidden="true"></div>
  <div class="wrap fx-in">
    <div class="fx-copy">
      <div class="fx-kicker"><span class="fx-dot"></span>Sunday Showcase · the line-up</div>
      <h2 class="fx-title">${l.when.replace(/ \d{4}$/, '')}</h2>
      <p class="fx-when">${l.count} acts${l.night ? html` · ${l.night.title}${l.night.doors ? html` · doors ${l.night.doors}` : ''}` : ''}</p>
      <p class="fx-lede">${named.length === l.count ? 'Meet every act before the night.' : `${named.length} of ${l.count} acts revealed so far.`} Tap an act to step into their world, invite your friends, and vote them into the Christmas Showcase Special.</p>
      <div class="ctas">${l.night ? html`<a class="btn fx-btn" href="${l.night.onSale ? `${base || PATH}#book` : l.night.href}">${l.night.onSale ? 'Free tickets' : 'The night'}</a>` : ''}<a class="btn ghost" href="${base}#this-sunday">Unwrap the tree</a>${base ? html`<a class="btn ghost" href="${base}">Play a showcase</a>` : ''}</div>
    </div>
    <div class="fx-car" data-carousel tabindex="0" role="region" aria-roledescription="carousel" aria-label="The acts">
      <div class="fx-stage">${l.acts.map((a, i) => {
        const v = clip(a);
        const pic = a.photo || (v && v.poster) || '';
        return html`<figure class="fx-slide${v ? ' is-video' : ''}${a.tba ? ' sc-fx-tba' : ''}" data-i="${i}" aria-roledescription="slide" aria-label="${i + 1} of ${l.acts.length}">${v
          ? html`<a href="${href(a)}" tabindex="-1"><video muted loop playsinline preload="metadata" poster="${v.poster || pic}" aria-label="${label(a)}"><source src="${v.src}" type="video/mp4"></video><img class="fx-alt" src="${pic}" alt="${label(a)}" hidden></a><button type="button" class="fx-sound" aria-pressed="false" aria-label="Sound on">🔇</button>`
          : a.tba || !pic
            ? html`<a href="${href(a)}" tabindex="-1" class="sc-fx-blank"><img src="/img/christmas/tam-logo-gold.png" alt="${label(a)}" width="400" height="400"><span>${a.tba ? '?' : a.name}</span></a>`
            : html`<a href="${href(a)}" tabindex="-1"><img src="${pic}" alt="${label(a)}" ${i > 2 ? html`loading="lazy"` : ''} width="900" height="1125"></a>`}<figcaption class="sc-fx-name"><b>${a.tba ? 'To be announced' : a.name}</b><span>${a.on ? html`${a.on} · ` : ''}Act ${a.n}${a.tba ? '' : html` ${vibeMark(a, 'sc-fx-vibe')}`}</span></figcaption></figure>`;
      })}</div>
      <div class="fx-ctrl"><button type="button" class="fx-arrow" data-dir="-1" aria-label="Previous act">‹</button>
        <div class="fx-dots" role="tablist">${l.acts.map((a, i) => html`<button type="button" role="tab" data-go="${i}" aria-label="${label(a)}"></button>`)}</div>
        <button type="button" class="fx-arrow" data-dir="1" aria-label="Next act">›</button></div>
      <p class="fx-caption" aria-live="polite"></p>
    </div>
  </div>
</section>`;
}

// This week's showcase: a Christmas tree with one present per act. Tap to unwrap.
export function treeSection(l) {
  if (!l || !l.count) return '';
  return html`<section class="section sc-xmas" id="this-sunday" aria-labelledby="sc-xmas-h"><div class="sc-snow" aria-hidden="true"></div><div class="wrap">
  <div class="head"><div class="label">This week’s showcase · ${l.count} acts</div><h2 class="chrome gold" id="sc-xmas-h">${l.when.replace(/ \d{4}$/, '')}</h2>
    <p class="muted">${l.night ? html`At <a href="${l.night.href}">${l.night.title}</a>${l.night.doors ? html`, doors ${l.night.doors}` : ''}. ` : ''}${l.count} acts are waiting under the Shard tree. Tap a present to unwrap it and meet the act.</p>${l.note ? html`<p>${l.note}</p>` : ''}</div>
  <div class="sc-scene">
    ${shardTree()}
    <ul class="plain sc-gifts">${l.acts.map((a, i) => html`<li class="sc-g c${i % 6}${a.tba ? ' tba' : ''}"${a.tba ? '' : html` data-signal="/api/showcases/${l.date}/act/${a.slug}"`}>
      <button class="sc-wrap" type="button" aria-expanded="false" aria-controls="sc-act-${a.n}" aria-label="Unwrap act ${a.n}"><span class="g-lid"></span><span class="g-l"></span><span class="g-r"></span><span class="g-bow"></span><span class="g-tag">Act ${a.n}</span></button>
      <div class="sc-card" id="sc-act-${a.n}"><div class="label">Act ${a.n}</div>
        ${a.tba ? html`<h3>To be announced</h3><p class="small muted">This act is still under wraps. Check back soon.</p>`
          : html`${a.photo ? html`<img class="sc-pic" src="${a.photo}" alt="${a.name}" loading="lazy">` : ''}<h3>${a.name}</h3>${a.plays ? html`<p class="sc-plays">${a.plays}</p>` : ''}<a class="small" href="${a.href}">Meet ${a.name} →</a>`}
      </div></li>`)}</ul>
  </div>
  <p class="sc-all"><button class="btn ghost" type="button" id="sc-unwrap-all">Unwrap them all</button></p>
  ${l.run ? html`<div class="sc-run"><div class="label">The running order</div><ol class="plain">${l.run.order.map((x, k) => { const act = l.acts.find((y) => y.slug === x.slug) || {}; return html`<li><b>${x.on}</b><a href="${act.href}">${act.name}</a>${l.run.intervalAt && k === l.run.order.findIndex((o) => o.off === l.run.intervalAt.from) ? html`<span class="sc-int">Interval ${l.run.intervalAt.from}–${l.run.intervalAt.to}</span>` : ''}</li>`; })}</ol><p class="small muted">Times may move a little on the night.</p></div>` : ''}
</div></section>`;
}

// The tree shows the next showcase still to come.
function thisWeek(ctx, showcase) {
  const l = showcase && showcase.next();
  return l ? html`${lineupCarousel(l)}${treeSection(l)}` : '';
}

// The coming nights for one circuit regular, from everything on the site.
function nightsFor(ctx, r, limit = 4) {
  const rx = new RegExp(r.match, 'i');
  return ctx.content.upcoming(ctx.today()).filter((n) => !n.festival && (rx.test(`${n.title} ${n.label || ''}`) || (r.series && n.series === r.series))).slice(0, limit);
}

function page(ctx, showcase) {
  const s = ctx.content.showcases;
  const circuit = s.circuit.map((r) => ({ ...r, nights: nightsFor(ctx, r) }));
  const desc = `${s.title}: want to play a showcase at TAM, Elephant & Castle? Start on the open mic circuit, meet the host, and register your interest.`;
  // this week's night, when TAM's box office sells it: free tickets (and a donation) right here
  const l = showcase && showcase.next();
  const n = l && l.night && l.night.onSale ? ctx.content.nightBy.get(l.night.slug) : null;
  return layout(ctx, {
    title: s.title, path: PATH, description: desc, scripts: ['/js/showcases.js', ...(n ? ['/js/festival.js'] : [])], og: '/img/og.jpg',
    ...(n ? { data: { booking: { ...bookingData(ctx, [n], null), preselect: n.slug, via: '' } } } : {}),
    jsonLd: { '@context': 'https://schema.org', '@type': 'EventSeries', name: s.title, description: desc, url: `${ctx.cfg.siteUrl}${PATH}`,
      organizer: { '@type': 'Organization', name: 'TAM, Temple of Art and Music', url: ctx.cfg.siteUrl } },
    body: html`<section class="hero sc-hero"><div class="wrap">
  <div class="sc-spot" aria-hidden="true"></div>
  <div class="sc-brand">${showcaseLockup('big')}</div>
  <div class="label">${s.kicker}</div>
  <h1 class="chrome gold">${s.title}</h1>
  <p class="lede">${s.lede}</p>
  <div class="ctas">${n ? html`<a class="btn hot" href="#book">Free tickets · ${l.when.replace(/ \d{4}$/, '')}</a>` : ''}<a class="btn ${n ? 'ghost' : 'hot'}" href="#circuit">Find an open night</a><a class="btn ghost" href="#register">Register your interest</a></div>
</div></section>
${thisWeek(ctx, showcase)}
${n ? html`${bookingSection(ctx, { nights: [n], single: true, heading: `Free tickets · ${l.when.replace(/ \d{4}$/, '')}`, intro: `Entry is free: book your place and we'll email your tickets. Doors ${n.doors}.` })}
<section class="section sc-give" id="donate"><div class="wrap narrow"><div class="sc-give-in">
  <div class="label">Pay it forward</div><h2>Keep grassroots music live at TAM</h2>
  <p>The Sunday Showcase is free, so new artists get a real stage, a real sound system and a real crowd. If you can, add a donation: it keeps the lights on and the stage open for the next act.</p>
  ${n.donate ? html`<a class="btn hot" href="${n.donate}" target="_blank" rel="noopener">Donate ↗</a><p class="small muted">Donations are taken safely on Eventbrite.</p>` : html`<p class="small muted">You can also give on the night, at the bar.</p>`}
</div></div></section>` : ''}
<section class="section"><div class="wrap"><div class="head"><h2 class="chrome">How to get a showcase</h2></div>
  <ol class="sc-steps">${s.steps.map((st, i) => html`<li><span class="sc-n">${i + 1}</span><h3>${st.title}</h3><p>${st.text}</p></li>`)}</ol></div></section>
<section class="section" id="circuit"><div class="wrap"><div class="head"><h2 class="chrome">The open mic circuit</h2><p class="muted">Every showcase artist starts here. Come and play, then tell us you'd like a showcase.</p></div>
  <div class="sc-circuit">${circuit.map((r) => html`<article class="sc-night">
    <div class="label">${r.when}</div><h3>${r.name}</h3>${r.host ? html`<p class="sc-host">Hosted by <b>${r.host}</b></p>` : ''}<p>${r.for}</p>
    ${r.nights.length ? html`<ul class="plain sc-dates">${r.nights.map((n) => html`<li><a href="${r.link || nightHref(n)}">${when(n)}</a> <span class="muted">${n.timesTbc ? '' : times(n)}</span></li>`)}</ul>`
      : html`<p class="small muted">New dates are announced on <a href="/whats-on">What’s on</a>.</p>`}
  </article>`)}</div></div></section>
<section class="section" id="register"><div class="wrap narrow">
  <form class="formbox sc-form" id="sc-form" novalidate>
    <div class="label">The call-out</div><h2 class="chrome gold">Register your interest</h2>
    <p>Tell us about your act. The best way to a showcase is to play an open night first, so tell us which one you’ve played or are coming to.</p>
    <div class="fields">
      <label class="field"><span>Your name</span><input name="name" maxlength="80" required autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" maxlength="200" required autocomplete="email"></label>
      <label class="field"><span>Act or band name</span><input name="act" maxlength="80"></label>
      <label class="field"><span>What you play</span><input name="style" maxlength="120" placeholder="e.g. soul trio, acoustic singer-songwriter, blues band"></label>
      <label class="field full"><span>Links to your music</span><input name="links" maxlength="300" placeholder="Instagram, Spotify, YouTube, SoundCloud…"></label>
      <label class="field full"><span>Your open night</span><select name="circuit" required><option value="">Choose…</option>
        ${s.circuit.map((r) => html`<option>I’ve played ${r.name}</option>`)}${s.circuit.map((r) => html`<option>I’m coming to ${r.name}</option>`)}<option>Not yet: tell me which to come to</option></select></label>
      <label class="field full"><span>Anything else</span><textarea name="message" maxlength="1200" rows="3" placeholder="How many of you, what you’d like to play, when you’re free"></textarea></label>
    </div>
    <button class="btn hot" type="submit">Send</button><p class="err" role="status" aria-live="polite"></p>
  </form>
</div></section>`,
  });
}

// One act's own page, in its own vibe: a hero image, a carousel of their
// photos and clips, their story and links, a way to invite friends, and a
// vote to bring them to the Christmas Showcase Special at The Best Christmas Ever.
function actPage(ctx, showcase, { l, a }) {
  const day = l.when.replace(/ \d{4}$/, '');
  const url = `${ctx.cfg.siteUrl}${a.href}`;
  const fest = showcase.festival();
  const festUrl = fest ? (fest.home && fest.home.url) || fest.path : 'https://christmas.tam.tv';
  const slides = [...(a.photo ? [{ type: 'image', src: a.photo }] : []), ...(a.media || [])];
  // pictures for the invite card: the hero photo first, then their other photos and the stills from their clips
  const pics = [...new Set(slides.map((m) => (m.type === 'video' ? m.poster : m.src)).filter(Boolean))];
  const others = l.acts.filter((x) => !x.tba);
  const i = others.findIndex((x) => x.slug === a.slug);
  const prev = others[(i - 1 + others.length) % others.length], nxt = others[(i + 1) % others.length];
  const invite = `Come and see ${a.name} at TAM's Sunday Showcase, ${day}${l.night && l.night.doors ? `, doors ${l.night.doors}` : ''}. TAM, Elephant & Castle. ${url}`;
  const desc = `${a.name}${a.plays ? `, ${a.plays}` : ''}: Act ${a.n} at TAM's Sunday Showcase, ${l.when}. Invite your friends, and vote for ${a.name} at the Christmas Showcase Special.`;
  return layout(ctx, {
    title: `${a.name} · Sunday Showcase`, path: a.href, description: desc, og: a.photo || '/img/og.jpg', scripts: ['/js/showcase-act.js'], bodyClass: `sc-actpage vibe-${a.vibe}${a.song ? ' has-song' : ''}`, ambient: null,
    // their song plays through Tamalume (the player bar); the page pulses to its beat
    ...(a.song ? { song: { youtubeId: a.song.youtubeId, title: a.song.title || `${a.name} live` }, data: { festival: { song: { bpm: a.song.bpm || 100 } } } } : {}),
    jsonLd: { '@context': 'https://schema.org', '@type': 'MusicEvent', name: `Sunday Showcase: ${a.name}`, startDate: l.date, url,
      performer: { '@type': 'PerformingGroup', name: a.name, ...(a.links.length ? { sameAs: a.links.map((k) => k.url) } : {}) },
      location: { '@type': 'MusicVenue', name: 'TAM, Temple of Art and Music', address: { '@type': 'PostalAddress', postalCode: 'SE1 6DR', addressLocality: 'London' } },
      ...(a.photo ? { image: `${ctx.cfg.siteUrl}${a.photo}` } : {}) },
    body: html`<section class="va-hero" data-signal="/api/showcases/${l.date}/act/${a.slug}" style="${a.photo ? html`--hero:url('${a.photo}')` : ''}">
  <div class="va-bg" aria-hidden="true"></div><div class="va-snow" aria-hidden="true"></div>
  <div class="wrap va-in">
    <div class="va-vibes">${vibeMark(a)}</div>
    <a class="va-brand" href="${PATH}#line-up" aria-label="Sunday Showcase × TAM: the line-up">${showcaseTitle()}</a>
    <p class="va-kicker">Act ${a.n} · ${day}</p>
    <h1 class="va-name">${a.name}</h1>
    ${a.plays ? html`<p class="va-plays">${a.plays}</p>` : ''}
    ${a.on ? html`<p class="va-on">On stage <b>${a.on}</b></p>` : ''}
    <p class="va-when">${l.night ? html`<a href="${l.night.href}">${l.night.title}</a>` : 'TAM'}${l.night && l.night.doors ? html` · doors ${l.night.doors}` : ''} · TAM, Elephant & Castle</p>
    <div class="ctas"><a class="btn va-btn" href="#invite">Invite your friends</a><a class="btn ghost" href="#xmas">Bring them to Christmas ✦</a></div>
  </div>
</section>
${listen(a)}
${slides.length > 1 ? html`<section class="fx-hero va-car" aria-label="${a.name}: photos and clips"><div class="fx-grid" aria-hidden="true"></div><div class="wrap">
  <div class="fx-car" data-carousel tabindex="0" role="region" aria-roledescription="carousel" aria-label="${a.name}">
    <div class="fx-stage">${slides.map((m, k) => html`<figure class="fx-slide${m.type === 'video' ? ' is-video' : ''}" data-i="${k}" aria-roledescription="slide" aria-label="${k + 1} of ${slides.length}">${m.type === 'video'
      ? html`<a href="#about" tabindex="-1"><video muted loop playsinline preload="metadata" poster="${m.poster || a.photo}" aria-label="${a.name} live"><source src="${m.src}" type="video/mp4"></video><img class="fx-alt" src="${m.poster || a.photo}" alt="${a.name} live" hidden></a><button type="button" class="fx-sound" aria-pressed="false" aria-label="Sound on">🔇</button>`
      : html`<a href="#about" tabindex="-1"><img src="${m.src}" alt="${a.name}" ${k > 2 ? html`loading="lazy"` : ''}></a>`}</figure>`)}</div>
    <div class="fx-ctrl"><button type="button" class="fx-arrow" data-dir="-1" aria-label="Previous">‹</button>
      <div class="fx-dots" role="tablist">${slides.map((m, k) => html`<button type="button" role="tab" data-go="${k}" aria-label="${k + 1} of ${slides.length}"></button>`)}</div>
      <button type="button" class="fx-arrow" data-dir="1" aria-label="Next">›</button></div>
    <p class="fx-caption" aria-live="polite"></p>
  </div></div></section>` : ''}
<section class="section va-about" id="about"><div class="wrap narrow">
  ${(a.blurb || '').split(/\n\s*\n|\n/).filter(Boolean).map((p) => html`<p>${p}</p>`)}
</div></section>
${follow(a)}
${(a.press || []).length ? html`<section class="section va-press" aria-labelledby="va-press-h"><div class="wrap narrow">
  <div class="label">In the press</div><h2 id="va-press-h">${a.name} in the news</h2>
  <ul class="plain va-press-list">${a.press.map((p) => html`<li><a href="${p.url}" target="_blank" rel="noopener"><span class="va-src">${p.source}</span><b>${p.title} ↗</b></a>${p.note ? html`<p>${p.note}</p>` : ''}</li>`)}</ul>
</div></section>` : ''}
${worldMap(a)}
<section class="section va-invite" id="invite"><div class="wrap"><div class="va-panel va-invite-in">
  <div class="va-invite-copy">
    <div class="label">Invite your friends</div><h2>Bring a crowd for ${a.name}</h2>
    <p>Pick a picture for your invite card, then send it. It carries the night: ${day}${l.night && l.night.doors ? html`, doors ${l.night.doors}` : ''}, at TAM, Elephant & Castle.</p>
    ${pics.length > 1 ? html`<fieldset class="va-pick"><legend class="small muted">Choose the picture</legend>${pics.map((src, k) => html`<label><input type="radio" name="card-pic" value="${src}" ${k === 0 ? 'checked' : ''}><img src="${src}" alt="Picture ${k + 1}" width="72" height="90" loading="lazy"></label>`)}</fieldset>` : ''}
    <div class="va-share" data-share data-url="${url}" data-text="${invite}" data-title="${a.name} · Sunday Showcase × TAM" data-file="${a.slug}-sunday-showcase.png">
      <button class="btn va-btn" type="button" data-native hidden>Send the card</button>
      <button class="btn ghost" type="button" data-save>Save the card</button>
      <a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent(invite)}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn ghost" href="mailto:?subject=${encodeURIComponent(`Come and see ${a.name} at TAM`)}&body=${encodeURIComponent(invite)}">Email</a>
      <a class="btn ghost" href="sms:?&body=${encodeURIComponent(invite)}">Text</a>
      <button class="btn ghost" type="button" data-copy>Copy link</button>
    </div><p class="small muted" data-share-msg role="status" aria-live="polite"></p>
  </div>
  <figure class="va-cardbox">
    <div class="va-card" data-card data-name="${a.name}" data-plays="${a.plays || ''}" data-day="${day}" data-doors="${a.on ? `On stage ${a.on}` : l.night && l.night.doors ? `Doors ${l.night.doors}` : ''}" data-act="Act ${a.n}" data-site="${url.replace(/^https?:\/\//, '')}" style="--pic:url('${pics[0] || ''}')">
      <div class="va-card-top">${showcaseLockup()}</div>
      <div class="va-card-mid"><b class="va-card-name">${a.name}</b>${a.plays ? html`<span>${a.plays}</span>` : ''}</div>
      <div class="va-card-foot"><div class="va-card-title">${showcaseTitle()}</div><p>${day}${l.night && l.night.doors ? html` · doors ${l.night.doors}` : ''} · Elephant & Castle</p></div>
    </div>
    <figcaption class="small muted">Your invite card</figcaption>
  </figure>
</div></div></section>
<section class="section va-xmas" id="xmas"><div class="sc-snow" aria-hidden="true"></div>${shardTree('va-tree')}<div class="wrap narrow"><div class="va-panel va-xpanel">
  <div class="label">✦ The Best Christmas Ever ✦</div><h2>Want ${a.name} at the Christmas Showcase Special?</h2>
  <p>The best of TAM’s Sunday Showcases get a spot at the Christmas Showcase Special, part of <a href="${festUrl}">The Best Christmas Ever</a>${fest && fest.dates ? html` (${dateRange(fest.dates)})` : ''}. Tell us you want to see ${a.name} there.</p>
  <button class="btn hot va-want" type="button" data-want="/api/showcases/${l.date}/act/${a.slug}/want">✦ I want to see ${a.name} at Christmas</button>
  <p class="va-count" data-want-count aria-live="polite">${a.wants ? `${a.wants} ${a.wants === 1 ? 'person wants' : 'people want'} to see ${a.name} at Christmas` : `Be the first to ask for ${a.name}`}</p>
</div></div></section>
<nav class="section va-nav" aria-label="More acts"><div class="wrap">
  ${others.length > 1 ? html`<a class="btn ghost" href="${prev.href}">← ${prev.name}</a>` : ''}<a class="btn ghost" href="${PATH}#line-up">The whole line-up</a>${others.length > 1 ? html`<a class="btn ghost" href="${nxt.href}">${nxt.name} →</a>` : ''}
</div></nav>`,
  });
}
// The Sunday Showcase brand: its mark (a sun rising over the stage) and its wordmark.
export const showcaseLockup = (cls = '') => html`<span class="ss-lockup ${cls}"><img src="/img/sunday-showcase-mark.svg" alt="" width="56" height="56"><span class="ss-word"><i>Sunday</i><b>Showcase</b></span></span>`;
// "Sunday Showcase × TAM": TAM in TAM's own lettering, with its mark.
export const showcaseTitle = () => html`<span class="ss-title"><span class="ss-t-ss"><i>Sunday</i> <b>Showcase</b></span><span class="ss-x">×</span><span class="ss-t-tam"><img src="/img/tam-mark-96.png" alt="" width="40" height="40">TAM</span></span>`;

// Follow them: each link as a big tile, with the @handle where the link has one.
const handleOf = (url) => { const m = /(?:instagram\.com|tiktok\.com\/@?|soundcloud\.com|twitter\.com|x\.com)\/@?([\w.]+)/i.exec(url); return m ? `@${m[1]}` : ''; };
function follow(a) {
  if (!a.links.length) return '';
  return html`<section class="section va-follow" aria-labelledby="va-follow-h"><div class="wrap narrow">
  <div class="label">Follow ${a.name}</div><h2 id="va-follow-h">Keep up with them</h2>
  <ul class="plain va-socials">${a.links.map((k) => html`<li><a href="${k.url}" target="_blank" rel="noopener"><span class="va-net">${k.label}</span><b>${handleOf(k.url) || 'Listen and watch'}</b><i aria-hidden="true">↗</i></a></li>`)}</ul>
</div></section>`;
}

// Listen: their song through Tamalume (a YouTube video), or, where they have
// no song yet, their own live clip, whose sound the page hears and dances to.
function listen(a) {
  const clip = !a.song && (a.media || []).find((m) => m.type === 'video');
  if (!a.song && !clip) return '';
  return html`<section class="section va-listen" id="listen" aria-labelledby="va-listen-h"><div class="wrap">
  <div class="head"><div class="label">Listen · Tamalume</div><h2 id="va-listen-h">${a.song ? a.song.title || `${a.name} live` : `${a.name} live`}</h2><p class="muted">Press play and the page moves with the music.</p></div>
  ${a.song ? html`<div class="va-video" data-youtube="${a.song.youtubeId}">
    <div class="va-video-in"><div id="va-player"></div><img class="vthumb" src="https://i.ytimg.com/vi/${a.song.youtubeId}/hqdefault.jpg" alt=""><button class="vplay" type="button">▶ Play ${a.name}</button></div>
    <div class="va-pulse" aria-hidden="true"></div></div>`
    : html`<div class="va-video va-clip"><div class="va-video-in"><video src="${clip.src}" ${clip.poster ? html`poster="${clip.poster}"` : ''} controls playsinline preload="metadata" crossorigin="anonymous" data-hear aria-label="${a.name} live"></video></div>
    <div class="va-pulse" aria-hidden="true"></div></div>`}
</div></section>`;
}

// Where in the world: their vibe's star on each place they're from, and a line to TAM.
function worldMap(a) {
  if (!a.places.length) return '';
  const tam = onMap(TAM.lat, TAM.lon);
  const away = a.places.filter((p) => p.code !== 'GB' || Math.abs(p.lon - TAM.lon) > 1);
  const arc = (p) => { const m = onMap(p.lat, p.lon); const cx = (m.x + tam.x) / 2, cy = Math.min(m.y, tam.y) - Math.max(30, Math.abs(m.x - tam.x) * 0.22); return `M${m.x} ${m.y} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${tam.x} ${tam.y}`; };
  return html`<section class="section va-world" aria-labelledby="va-world-h"><div class="wrap">
  <div class="head"><div class="label">Where in the world</div><h2 id="va-world-h">${away.length ? html`From ${away.map((p) => p.name).join(' & ')} to TAM` : html`${a.name}: London’s own`}</h2></div>
  <div class="va-map" role="img" aria-label="${a.name}: ${a.places.map((p) => p.name).join(', ')}, and TAM in London">
    <div class="va-land"></div>
    <svg class="va-arcs" viewBox="0 42 1000 370" preserveAspectRatio="none" aria-hidden="true">${away.map((p) => html`<path d="${arc(p)}" pathLength="1"></path>`)}</svg>
    ${away.map((p) => { const m = onMap(p.lat, p.lon); return html`<span class="va-star" style="left:${m.left}%;top:${m.top}%"><i>${(VIBE_MARKS[a.vibe] || VIBE_MARKS.stage)[1]}</i><b>${p.name}</b></span>`; })}
    ${(() => { const uk = a.places.find((p) => !away.includes(p)); return html`<span class="va-star${away.length ? ' va-tam' : ''}" style="left:${tam.left}%;top:${tam.top}%"><i>${uk ? (VIBE_MARKS[a.vibe] || VIBE_MARKS.stage)[1] : '★'}</i><b>${uk ? 'London · TAM' : TAM.label}</b></span>`; })()}
  </div>
</div></section>`;
}

const dateRange = (d) => { const [a, b] = [new Date(`${d.from}T12:00:00Z`), new Date(`${d.to}T12:00:00Z`)]; const m = (x) => x.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }); return `${a.getUTCDate()}${m(a) === m(b) ? '' : ` ${m(a)}`}–${b.getUTCDate()} ${m(b)}`; };

// Staff: who's in this week's showcase, in running order.
function manage(ctx) {
  return layout(ctx, {
    title: 'Sunday Showcase: line-up', path: `${PATH}/manage`, noindex: true, ambient: null, scripts: ['/js/showcases-manage.js', '/js/running-order.js'], bodyClass: 'staff',
    body: html`<section class="section"><div class="wrap narrow">
    <div class="label">TAM back office</div><h1 class="chrome gold">Sunday Showcases</h1>
    <p><a class="btn ghost small" href="${PATH}#this-sunday" target="_blank" rel="noopener">See the tree ↗</a> <a class="btn ghost small" href="/shows">Shows</a></p>
    <div class="formbox" id="team-login" hidden><h3>Sign in</h3><p class="small muted">Sign in at <a href="/shows">/shows</a> with your work email, then come back here.</p></div>
    <div id="sc-manage" hidden></div></div></section>`,
  });
}

export function routes(r, ctx, showcase) {
  if (!ctx.content.showcases) return;
  r.get(PATH, (req, res) => respond(res, page(ctx, showcase)));
  r.get(`${PATH}/manage`, (req, res) => respond(res, manage(ctx)));
  r.get(`${PATH}/:date/:act`, (req, res, { params }) => {
    const x = showcase.act(params.date, params.act);
    if (!x) return respond(res, layout(ctx, { title: 'Not here', path: req.url, noindex: true, body: html`<section class="section"><div class="wrap narrow"><h1 class="chrome">That act isn’t here</h1><p><a href="${PATH}#line-up">See the Sunday Showcase line-up</a>.</p></div></section>` }), 404);
    respond(res, actPage(ctx, showcase, x));
  });
  r.get('/showcases', (req, res) => redirect(res, PATH, 301));
}
