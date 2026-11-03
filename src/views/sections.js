// Festival feature sections. A festival switches each on in its `features`;
// the festival page and its event pages both use them.

import { html } from './html.js';
import { pounds } from '../../shared/pricing.js';
import { festivalCalendar, when } from './layout.js';

// Everything the booking form needs, for page-data.
export function bookingData(ctx, nights, f) {
  return {
    festival: f ? f.slug : null,
    nights: nights.filter((n) => n.sale).map((n) => ({
      slug: n.slug, title: n.title, label: n.label, date: n.date, weekday: n.weekday, day: n.day, month: n.month,
      sale: n.sale, timesTbc: n.timesTbc, doors: n.doors,
    })),
    donation: f && f.features.donation ? f.donation : null,
    teamTables: f && f.features.teamTables ? f.teamTables : null,
  };
}

export function bookingSection(ctx, { nights, festival: f, single = false, heading = 'Pick your night', intro = '' }) {
  if (!nights.some((n) => n.sale)) return '';
  const teams = f && f.features.teamTables;
  const donation = f && f.features.donation;
  return html`<section class="section tix" id="book" aria-labelledby="book-title">
  <div class="wrap">
    <div class="head">
      <div><div class="label">Tickets</div><h2 id="book-title" class="chrome gold">${heading}</h2></div>
      ${intro ? html`<p class="intro">${intro}</p>` : ''}
    </div>
    <form class="tix-grid" id="book-form" data-single="${single ? '1' : ''}" novalidate>
      <div>
        <fieldset class="step" ${single ? 'hidden' : ''}><legend><b>1</b>Night</legend><div class="nights" id="b-nights" role="group" aria-label="Nights"></div></fieldset>
        <fieldset class="step"><legend><b>${single ? 1 : 2}</b>Ticket</legend><div class="types" id="b-types"></div><p class="hint" id="b-type-note"></p></fieldset>
        <div class="step">
          <span class="lg" id="qty-label"><b>${single ? 2 : 3}</b>How many</span>
          <div class="qty"><button type="button" data-step="-1" aria-label="One fewer ticket">−</button><input id="b-qty" name="qty" type="number" inputmode="numeric" min="1" value="2" aria-labelledby="qty-label"><button type="button" data-step="1" aria-label="One more ticket">+</button></div>
          <p class="hint" id="b-qty-hint" aria-live="polite"></p>
        </div>
        ${teams ? html`<fieldset class="step" id="b-mix-step"><legend><b>✦</b>Team table</legend>
          <div class="mix">
            <label class="opt"><input type="radio" name="mix" value="none" checked><span>Just us<small>Your own group, no shared table.</small></span></label>
            <label class="opt"><input type="radio" name="mix" value="new"><span>Start a team table<small>Other small teams on your night can join you, up to ${f.teamTables.seats} people.</small></span></label>
            <label class="opt" id="b-join-opt"><input type="radio" name="mix" value="join"><span>Join a team table<small id="b-join-note">Sit with another small team.</small></span></label>
            <div class="tables-pick" id="b-tables" hidden></div>
          </div></fieldset>` : ''}
        <fieldset class="step"><legend><b>✦</b>Your details</legend>
          <div class="fields">
            <label class="field"><span>Name</span><input name="name" autocomplete="name" required maxlength="80"></label>
            <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required maxlength="200"></label>
            <label class="field"><span>Company (optional)</span><input name="company" autocomplete="organization" maxlength="80"></label>
            <label class="field" id="b-team-field" hidden><span>Team name</span><input name="teamName" maxlength="60"></label>
            <div class="field full" id="b-vip" hidden>
              <label class="check"><input type="checkbox" name="tableRequest"> Request a table for our group</label>
              <small>Everyone in the group needs this ticket, so book one for each person.</small>
              <input name="tableNote" maxlength="300" aria-label="Table request details" placeholder="Anything we should know">
            </div>
            <label class="field full" id="b-blurb-field" hidden><span>One line about your team (shown on the team table)</span><input name="blurb" maxlength="140" placeholder="e.g. Five designers building a music app"></label>
          </div>
        </fieldset>
      </div>
      <aside class="summary" aria-labelledby="sum-title">
        <h3 id="sum-title">Your booking</h3>
        <dl><dt>Night</dt><dd id="s-night">Pick a night</dd><dt>Tickets</dt><dd id="s-tix">–</dd><dt>Deal</dt><dd id="s-deal">–</dd><dt>You save</dt><dd id="s-save" class="save">–</dd></dl>
        ${donation ? html`<fieldset class="give"><legend>Add a donation <small>optional</small></legend><p class="hint">${f.donation.blurb}</p><div class="give-opts" id="b-give"></div>
          <label class="give-other" id="b-give-other" hidden><span>£</span><input name="donationOther" type="number" inputmode="decimal" min="1" step="0.01" aria-label="Donation amount in pounds" placeholder="Amount"></label></fieldset>` : ''}
        <div class="total"><span>Total</span><b id="s-total">£0</b></div>
        <button class="btn hot" type="submit" id="b-pay" disabled>Book tickets</button>
        <p class="hint" id="b-pay-note"></p>
        <p class="hint small">We use your details to send your tickets. <a href="/privacy">Privacy notice</a>.</p>
        <p class="err" id="b-err" role="alert"></p>
      </aside>
    </form>
    <div id="book-ok" class="ok" hidden tabindex="-1"></div>
  </div>
</section>`;
}

export function datesSection(ctx, f) {
  return html`<section class="section dates" id="dates" aria-labelledby="dates-title">
  <div class="wrap">
    <div><div class="label">When</div><h2 id="dates-title" class="chrome gold big">${Number(f.dates.from.slice(8))} — ${Number(f.dates.to.slice(8))}</h2>
      <p>${f.datesNote || ''} Tap a night to see it and book. Nights with a ★ have their own line-up.</p></div>
    <div class="cal-box">${festivalCalendar(ctx, f)}
      <div class="legend"><span><i class="k-edge"></i>Headline nights</span><span><i class="k-wk"></i>Weekends</span><span><i class="k-on"></i>Festival nights</span><span><i class="x"></i>Closed</span></div>
    </div>
  </div>
</section>`;
}

export function programmeSection(f) {
  if (!(f.programme || []).length) return '';
  return html`<section class="section prog" id="programme" aria-labelledby="prog-title"><div class="wrap">
  <div class="head"><h2 id="prog-title" class="chrome">What's on</h2></div>
  <div class="grid4">${f.programme.map((p, i) => html`<article class="card c${(i % 4) + 1}"><h3>${p.title}</h3><p>${p.text}</p>${p.image ? html`<img src="${p.image}" alt="" loading="lazy">` : ''}</article>`)}</div>
</div></section>`;
}

export function charitySection(f) {
  if (!f.features.donation) return '';
  const d = f.donation;
  return html`<section class="section charity" id="charity" aria-labelledby="charity-title"><div class="wrap charity-in">
  <div><div class="label">This season we’re raising money for</div><h2 id="charity-title" class="chrome gold">${d.charity.name}</h2>
    <p class="intro">${d.intro || d.blurb}</p><p class="raised" id="raised" hidden></p>
    ${f.features.raffle ? html`<p class="intro">And on the night: the raffle, ${pounds(f.raffle.price)} a ticket${f.raffle.deal ? ` or ${f.raffle.deal.count} for ${pounds(f.raffle.deal.price)}` : ''}. ${f.raffle.prizesNote || ''} ${f.raffle.draw || ''}.</p>` : ''}
    <div class="ctas"><a class="btn hot" href="#book">Add a donation when you book</a><a class="btn ghost" href="${d.charity.url}" target="_blank" rel="noopener">Give directly ↗</a></div></div>
  <img class="charity-heart neon-ico" src="/img/neon/heart.svg" alt="" width="220" height="220">
</div></section>`;
}

export function teamTablesSection(f, { night } = {}) {
  if (!f.features.teamTables) return '';
  return html`<section class="section teams" id="teams" aria-labelledby="teams-title"><div class="wrap">
  <div class="head"><div><div class="label">Small teams, one big table</div><h2 id="teams-title" class="chrome">Team Tables</h2></div>
    <p class="intro">Too small for a party of your own? Share one. Teams start a table, other teams join it, and everyone gets a bigger night.</p></div>
  <ol class="how"><li>Book your team's tickets and choose <b>Start a team table</b>.</li><li>Your table appears here for that night, with your team name and a line about you.</li><li>Other teams book the same night and join, until the table's ${f.teamTables.seats} seats are full.</li></ol>
  <div class="table-list" id="table-list" data-night="${night || ''}"><p class="muted">No team tables yet. Start the first one when you book.</p></div>
</div></section>`;
}

export function wallSection(f) {
  if (!f.features.partyWall) return '';
  return html`<section class="section wall" id="wall" aria-labelledby="wall-title"><div class="wrap">
  <div class="head"><div><div class="label">Who's partying at TAM</div><h2 id="wall-title" class="chrome red">The Party Wall</h2></div>
    <p class="intro">Having your party here? Pin your brand to the wall so everyone knows. Sponsors get a gold pin.</p></div>
  <div class="pins" id="pins" data-festival="${f.slug}"></div>
  <form class="formbox" id="pin-form" novalidate>
    <h3>Pin your brand</h3><p>Use the reference and email from your booking. Pins go up once we've checked them.</p>
    <div class="fields">
      <label class="field"><span>Booking reference</span><input name="ref" required placeholder="TAM-XXXXXX" maxlength="20" autocapitalize="characters"></label>
      <label class="field"><span>Booking email</span><input name="email" type="email" required maxlength="200"></label>
      <label class="field"><span>Company</span><input name="company" required maxlength="60"></label>
      <label class="field"><span>Website (optional)</span><input name="website" type="url" maxlength="200" placeholder="example.com"></label>
      <label class="field full"><span>Tagline (optional)</span><input name="tagline" maxlength="90"></label>
      <label class="field full"><span>Logo (PNG, JPG or WebP)</span><input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></label>
    </div>
    <button class="btn hot" type="submit">Pin it</button><p class="err" role="status" aria-live="polite"></p>
  </form>
</div></section>`;
}

export function sponsorSection(ctx, f) {
  if (!f.features.sponsorship) return '';
  const s = f.sponsorship;
  return html`<section class="section spons" id="sponsor" aria-labelledby="sponsor-title"><div class="wrap">
  <div class="head"><div><div class="label">Sponsorship</div><h2 id="sponsor-title" class="chrome gold">Sponsor a night</h2></div><p class="intro">${s.intro}</p></div>
  ${s.gift ? html`<div class="xbox"><img class="gift neon-ico" src="/img/neon/gift.svg" alt="" width="64" height="64"><p>${s.gift}</p></div>` : ''}
  <div class="pkgs">${s.packages.map((p) => html`<article class="pkg"><h3>${p.name}</h3><p class="price">${pounds(p.price)}</p><ul>${p.perks.map((x) => html`<li>${x}</li>`)}</ul></article>`)}</div>
  <form class="formbox" id="spon-form" data-festival="${f.slug}" novalidate>
    <h3>Talk to us about sponsoring</h3><p>Tell us what you have in mind and we'll come back to you within two working days.</p>
    <div class="fields">
      <label class="field"><span>Package</span><select name="package" required>${s.packages.map((p) => html`<option value="${p.id}">${p.name} · ${pounds(p.price)}</option>`)}</select></label>
      <label class="field"><span>Preferred night</span><select name="night"><option value="">Not sure yet</option>${ctx.content.nightsFor(f.slug).map((n) => html`<option value="${n.slug}">${when(n)}${n.label ? ` · ${n.label}` : ''}</option>`)}</select></label>
      <label class="field"><span>Company</span><input name="company" required maxlength="80" autocomplete="organization"></label>
      <label class="field"><span>Your name</span><input name="name" required maxlength="80" autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" required maxlength="200" autocomplete="email"></label>
      <label class="field"><span>Phone (optional)</span><input name="phone" type="tel" maxlength="30" autocomplete="tel"></label>
      <label class="field full"><span>Anything else</span><textarea name="message" maxlength="1000"></textarea></label>
    </div>
    <button class="btn hot" type="submit">Send enquiry</button><p class="err" role="status" aria-live="polite"></p>
  </form>
</div></section>`;
}

// The song, its story layer and the remix-card maker.
export function songSection(ctx, f) {
  if (!f.song) return '';
  const a = ctx.content.artistBy.get(f.song.artist);
  const story = f.song.stories ? ctx.content.storyBy.get(f.song.stories) : null;
  const cards = f.features.cards && f.cards;
  return html`<section class="section trailer" id="song" aria-labelledby="song-title"><div class="wrap">
  <div class="vid" id="vidbox" data-youtube="${f.song.youtubeId}">
    <div class="xvideo"><div id="trailer-player"></div><img class="vthumb" src="https://i.ytimg.com/vi/${f.song.youtubeId}/hqdefault.jpg" alt=""><button class="vplay" type="button">▶ Play the song</button></div>
    ${story ? html`<div class="storybook" id="storybook" aria-live="polite"></div>` : ''}
    <div class="fx-layer" id="fx-layer" aria-hidden="true"></div>
  </div>
  <div class="song">
    <div class="label">The theme song</div>
    <h2 id="song-title" class="chrome gold">“${f.song.title}”</h2>
    ${a ? html`<div class="who"><a href="/artists/${a.slug}">${a.name.toUpperCase()}</a></div>` : ''}
    <p>${f.song.about || ''}</p>
    ${story ? html`<label class="switch"><input type="checkbox" id="stories-toggle" checked><span>Show ${story.title.toLowerCase()}</span></label>
      <div class="themes"><span class="label" id="themes-label">Story themes</span><div class="chips" id="theme-chips" role="group" aria-labelledby="themes-label"></div></div>` : ''}
  </div>
  ${cards ? html`<form class="remix" id="card-form" data-festival="${f.slug}" novalidate>
    <div class="remix-head"><div><div class="label">Remix it</div><h3>${cards.heading || 'Make it your card'}</h3></div><p>${cards.blurb || ''}</p></div>
    <div class="remix-grid">
      <fieldset><legend>Effects</legend><div class="chips" id="fx-chips"></div></fieldset>
      ${cards.polaroids || cards.maxOwnPhotos ? html`<fieldset class="full"><legend>Photos <small>(${cards.polaroids ? `pick up to ${cards.maxPolaroids} Polaroids, or ` : ''}add up to ${cards.maxOwnPhotos} of your own)</small></legend>
        ${cards.polaroids ? html`<div class="pola-pick" id="pola-pick"></div>` : ''}
        <div class="own-pick" id="own-pick"><label class="own-add"><input type="file" accept="image/*" id="own-file" multiple><span>+ Add your own photo</span></label></div>
        ${cards.polaroids ? html`<p class="pola-note">The Polaroids carry their owner's watermark. Only add photos you own.</p>` : ''}</fieldset>` : ''}
    </div>
    <div class="fields">
      <label class="field"><span>To</span><input name="to" maxlength="40" placeholder="e.g. Grandma"></label>
      <label class="field"><span>From</span><input name="from" maxlength="40" placeholder="Your name" autocomplete="given-name"></label>
      <label class="field full"><span>Your message</span><textarea name="text" maxlength="200" rows="2" placeholder="${cards.placeholder || ''}"></textarea></label>
    </div>
    <button class="btn hot" type="submit">Make my card</button><p class="err" role="status" aria-live="polite"></p>
    <div class="card-out" id="card-out" hidden>
      <p><b>Your card is ready.</b> Send it to someone:</p>
      <div class="card-link"><label class="sr" for="card-link">Card link</label><input id="card-link" readonly><button class="btn ghost" type="button" data-copy="#card-link">Copy link</button></div>
      <div class="row-btn"><button class="btn hot" type="button" id="share-native" hidden>Share</button><a class="btn ghost" id="share-wa" target="_blank" rel="noopener">WhatsApp</a><a class="btn ghost" id="share-mail">Email</a><a class="btn ghost" id="share-open" target="_blank" rel="noopener">Open the card</a></div>
    </div>
  </form>` : ''}
</div></section>`;
}

export function visitSection(ctx, venueSlug) {
  const v = ctx.content.venueBy.get(venueSlug || ctx.content.site.defaultVenue);
  if (!v) return '';
  return html`<section class="section visit" id="visit" aria-labelledby="visit-title"><div class="wrap">
  <div><div class="label">Where</div><h2 id="visit-title" class="chrome">Find TAM</h2>
    <p class="addr" id="addr">${v.name}<br>${v.place}<br>${v.address}</p>
    ${(v.transport || []).length ? html`<ul class="facts">${v.transport.map(([k, t]) => html`<li><b>${k}</b><span>${t}</span></li>`)}</ul>` : ''}
    <div class="row-btn">${v.maps ? html`<a class="btn hot" href="${v.maps}" target="_blank" rel="noopener">Open in Maps</a>` : ''}
      <button class="btn ghost" type="button" data-copy-text="${`${v.name}, ${v.place}, ${v.address}`}">Copy address</button></div>
  </div>
</div></section>`;
}

export function countdown(n, { link = '' } = {}) {
  if (!n) return '';
  return html`<div class="countdown" role="timer" data-countdown data-start="${n.start}" data-end="${n.end}" data-href="/events/${n.slug}" data-link="${link}"></div>`;
}
