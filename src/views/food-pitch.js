// The trader pitch on the web, for Vivian (and anyone on the team) to use with
// MM's food traders:
// - /food/partners: the presentation for owners, one slide per screen, made to
//   show on a phone at their counter (public but not indexed).
// - /food/manage/pitch: the team's notes behind the staff sign-in: the staff
//   and owner pitches, questions owners ask, today's list of who to see (from
//   the back office), and the team's own questions and challenges.

import { html } from './html.js';
import { html as respond } from '../lib/http.js';
import { layout } from './layout.js';

export const STAFF_PITCH = 'Hi, I’m from TAM, the live music room just over there. We’re running a Christmas festival from 4 December, and we’d like to send our guests to you with their food orders already in. They order on our website before the night, pick a time, and collect and pay at your counter. You’d get a list of exactly what to cook before you start, so nothing goes to waste. It’s free, there’s no commission, and you choose which nights. Could you pass this on to the owner or manager? All we need is their name and best email, and we’ll send them the details.';

const OWNER_PITCH = [
  ['Who we are', 'We’re TAM, the live music venue inside MM. We run nights all year, and The Best Christmas Ever festival from 4 to 29 December.'],
  ['Their problem', 'On event nights everyone turns up around doors. You get a rush, a queue, and you’re guessing how much to prep. Too much is waste; too little and people walk away.'],
  ['The idea', 'When people book a TAM night, they can pre-order from you on our site, with dishes and a 15-minute collection time. You get an email for every order and a prep list for the night, before you start cooking.'],
  ['What it costs', 'Nothing. No fee, no commission. They pay you at your counter, through your own till. You choose which nights, when orders close, how many you take and what’s on your menu, and you can switch it off any time.'],
  ['The one rule', 'It’s food only. TAM runs its own bar and no outside drinks are allowed in, so drinks aren’t on it.'],
  ['The ask', 'Can I take your email? We’ll send you a link today. Your listing is already started from your MM page: check it, add prices, pick your nights. About ten minutes, and nothing goes live until you’re happy.'],
];

const QA = [
  ['What if people don’t turn up?', 'They haven’t paid, so it’s a real risk. You can cap orders per night, close orders 24 hours before, and customers get a link to cancel before the cut-off. If no-shows become a problem, we can add paying in advance.'],
  ['What’s the catch? What does TAM get?', 'No fee and no commission. Our guests have a better night when they can eat without queueing, and that’s what we get.'],
  ['How many orders will we get?', 'Honestly, we don’t know yet: this is the first festival with pre-orders.'],
  ['Do I need new equipment or an app?', 'No. Orders come by email and on a web page that works on any phone. You take payment on your own till.'],
  ['Who handles allergies?', 'You do, as now. Customers can add a note to their order, and the guide tells them to check allergens with you.'],
  ['Can I choose which nights?', 'Yes: every TAM night, or only the ones you pick. You set when orders close and the most you’ll take.'],
  ['Can I change my menu and prices?', 'Yes, any time from your page. TAM checks profile changes before they show, so nothing odd goes public.'],
  ['Why no drinks?', 'TAM runs its own bar and doesn’t allow outside drinks in, so drinks aren’t part of it. Desserts are welcome.'],
  ['Where’s my listing from?', 'We started it from your Mercato Metropolitano page. Change anything you like; nothing goes live until you’re happy.'],
  ['What if I want to stop?', 'Switch pre-orders off on your page. Orders you’ve already accepted still need to be made.'],
];

// the owners' presentation: [eyebrow, heading, body, cards?]
const SLIDES = [
  { kind: 'cover', eyebrow: 'TAM × Mercato Metropolitano traders', h: 'Know what to cook before the doors open', p: 'Pre-orders from people coming to TAM’s nights, starting with The Best Christmas Ever, 4 to 29 December.' },
  { eyebrow: 'Who we are', h: 'TAM is the live music room inside MM', light: true, cards: [
    ['Live nights all year', 'Open mics, showcases, the Great British Blues Jam, karaoke and festivals, right here at Elephant & Castle.'],
    ['The Best Christmas Ever', 'Our Christmas festival runs 4 to 29 December, with ticketed nights and bands from across London.'],
    ['Hungry audiences', 'Our guests arrive around doors and want to eat before the music starts, a few steps from your counter.']] },
  { eyebrow: 'The problem', h: 'Event nights are a guessing game', cards: [
    ['Everyone arrives at once', 'A show’s audience turns up around doors, so the queue builds and some give up before they order.'],
    ['You prep blind', 'Cook too much and it’s wasted. Cook too little and you sell out with people still waiting.'],
    ['Staffing is a gamble', 'Without knowing the numbers, it’s hard to decide who to put on, and for how long.']], numbered: true },
  { eyebrow: 'How it works', h: 'Orders in before the night', light: true, numbered: true, cards: [
    ['They book a TAM night', 'On tam.tv, guests see “Pre-order your food” with your stall and menu.'],
    ['They order from you', 'They choose dishes and a 15-minute collection time.'],
    ['You get the order', 'An email for each order, plus a prep list for the night.'],
    ['They collect and pay you', 'At their time, at your counter. The money goes straight to you.']] },
  { eyebrow: 'What you get', h: 'Cook what’s needed, sell more of it', cards: [
    ['Less waste', 'You know the dishes and quantities before you start, so less goes in the bin.'],
    ['Better planning', 'Orders by collection time show when the rush is, so you can staff and prep around it.'],
    ['Sales you’d miss', 'Guests who’d skip a long queue before a show order from you instead.'],
    ['A free listing', 'Your stall, menu, photos and Instagram on tam.tv, seen by everyone planning a night at TAM.']] },
  { kind: 'statement', eyebrow: 'What it costs you', h: 'Nothing. No fee, no commission, no new kit.', p: 'Guests pay you at your counter, through your own till. You choose which nights, when orders close, how many you take and what’s on the menu, and you can switch it off any time.' },
  { eyebrow: 'What you see', h: 'A prep list for every night', light: true, kind: 'prep' },
  { eyebrow: 'One thing to know', h: 'It’s food only', p: 'TAM runs its own bar, and no outside drinks are allowed into the venue. So pre-orders are for food: drinks don’t appear on your TAM menu and can’t be pre-ordered. Desserts and sweet things are very welcome.' },
  { eyebrow: 'Getting started', h: 'About ten minutes, once', light: true, numbered: true, cards: [
    ['Open your invite', 'We email you a personal link. Add your email and your listing is yours to manage.'],
    ['Check your listing', 'We’ve started it from your MM page: your description, photos and menu. Fix anything, add prices.'],
    ['Pick your nights', 'Every TAM night, or just the ones you want. Set when orders close and how many you’ll take.']], after: 'Nothing goes live until you’re happy with it.' },
  { kind: 'cover', eyebrow: 'Let’s try it for Christmas', h: 'Ready for 4 December?', p: 'Give us the best email for the owner or manager and we’ll send your invite today.', contact: true },
];

function slide(s, i, n) {
  const cls = `pz-slide${s.light ? ' light' : ''}${s.kind === 'statement' ? ' gold' : ''}${s.kind === 'cover' ? ' cover' : ''}`;
  return html`<section class="${cls}" id="s${i + 1}" aria-label="Slide ${i + 1} of ${n}"><div class="pz-in">
    <p class="pz-eyebrow">${s.eyebrow}</p>${s.kind === 'cover' ? html`<h1>${s.h}</h1>` : html`<h2>${s.h}</h2>`}
    ${s.p ? html`<p class="pz-lede">${s.p}</p>` : ''}
    ${s.cards ? html`<div class="pz-cards">${s.cards.map(([t, b], j) => html`<div class="pz-card">${s.numbered ? html`<b class="pz-num">${j + 1}</b>` : ''}<h3>${t}</h3><p>${b}</p></div>`)}</div>` : ''}
    ${s.kind === 'prep' ? html`<div class="pz-cards"><div class="pz-card"><h3>Example: a Christmas Friday</h3><table class="pz-table"><tr><th>Dish</th><th>To cook</th></tr><tr><td>Your best seller</td><td>18</td></tr><tr><td>Second dish</td><td>11</td></tr><tr><td>Side</td><td>24</td></tr></table><p class="pz-small">Example numbers.</p></div>
      <div class="pz-card"><h3>And for each night</h3><ul><li>Orders by collection time</li><li>Each customer’s order and notes</li><li>What to take on collection</li><li>A spreadsheet download</li></ul></div></div>
      <p class="pz-small">Orders close when you choose, 24 hours before by default, so the list is final before you start prepping.</p>` : ''}
    ${s.after ? html`<p class="pz-lede">${s.after}</p>` : ''}
    ${s.contact ? html`<div class="pz-chips"><span>Vivian · TAM operations · vivian@tam.tv</span><span>Sieng · TAM · sieng@tam.tv</span></div><p><a class="btn hot" href="/food">See TAM’s food guide</a></p>` : ''}
    <p class="pz-page">${i + 1} / ${n}</p></div></section>`;
}

function partners(ctx) {
  return layout(ctx, {
    title: 'Partner with TAM: pre-orders for MM traders', path: '/food/partners', noindex: true, ambient: null, bodyClass: 'staff pz', scripts: ['/js/food-pitch.js'],
    description: 'How pre-orders from TAM nights work for Mercato Metropolitano’s food traders: less waste, better planning, no fee.',
    body: html`<div class="pz-deck" id="pz-deck" tabindex="0">${SLIDES.map((s, i) => slide(s, i, SLIDES.length))}</div>
      <nav class="pz-nav" aria-label="Slides"><button type="button" data-go="-1" aria-label="Previous slide">‹</button><button type="button" data-go="1" aria-label="Next slide">›</button></nav>`,
  });
}

function notes(ctx) {
  return layout(ctx, {
    title: 'Trader pitch: notes for the team', path: '/food/manage/pitch', noindex: true, ambient: null, bodyClass: 'staff', scripts: ['/js/food-pitch.js'],
    body: html`<section class="section"><div class="wrap"><div class="shows-top"><div><div class="label">TAM back office · <a href="/food/manage">Food guide</a></div><h1 class="chrome gold">Trader pitch</h1></div><div id="pzn-who" class="small muted"></div></div>
      <div class="formbox" id="team-login" hidden><h3>Sign in</h3><p class="small muted">Type your work email and we’ll send you a one-tap sign-in link.</p>
      <form id="team-link"><input type="hidden" name="next" value="/food/manage/pitch"><label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <button class="btn hot" type="submit">Email me a link</button><p class="err" role="status" aria-live="polite"></p></form></div>
      <div id="pzn" hidden>
      <nav class="cm-tabs pz-jump"><a href="#ask">The ask</a><a href="#staff">Staff pitch</a><a href="#owner">Owner pitch</a><a href="#qa">Questions</a><a href="#today">Who to see</a><a href="#questions">Your questions</a></nav>
      <div class="formbox" id="ask"><h2>The ask</h2><p>The same for every trader: <b>the owner’s or manager’s name, and their best email or number</b>, so Sieng can send their invite the same day. Show owners the presentation on your phone: <a href="/food/partners" target="_blank">tam.tv/food/partners</a>.</p></div>
      <div class="formbox" id="staff"><h2>Staff pitch: to pass on to the owner (30 seconds)</h2><blockquote class="pz-quote">${STAFF_PITCH}</blockquote>
        <p class="small">If they can’t give an email: who’s the owner, and when are they in? Is there a number or Instagram we can message them on? Could they take a photo of this and send it on?</p>
        <p><button class="btn ghost small" type="button" data-copy="staff">Copy it to send</button> <span class="small muted" data-copied></span></p></div>
      <div class="formbox" id="owner"><h2>Owner pitch (2 minutes)</h2><ol class="pz-steps">${OWNER_PITCH.map(([t, b]) => html`<li><b>${t}.</b> “${b}”</li>`)}</ol>
        <p>Close with the date: “The festival starts 4 December, so the sooner you’re set up, the more orders you’ll get.”</p></div>
      <div class="formbox" id="qa"><h2>Questions owners might ask</h2><p class="small">The hardest one is no-shows: be straight about it.</p><dl class="pz-qa">${QA.map(([q, a]) => html`<dt>${q}</dt><dd>${a}</dd>`)}</dl></div>
      <div class="formbox" id="today"><h2>Who to see</h2><p class="small muted">From the back office, live: traders flagged to ask in person. When you get a contact, add it in the <a href="/food/manage">food guide back office</a> (Listings, Details), or write it in the box below and Sieng will put it in.</p><div id="pzn-list"><p class="muted">Loading…</p></div></div>
      <div class="formbox" id="questions"><h2>Your questions and challenges</h2><p>Push back on anything: the pitch, the list, the order, or whether we should do this at all. Sieng gets an email and answers here.</p>
        <form id="pzn-q" novalidate><div class="fields"><label class="field"><span>About (optional)</span><input name="about" maxlength="80" placeholder="e.g. the owner pitch, Hot Chick, no-shows"></label>
        <label class="field full"><span>Your question, challenge or a contact you got</span><textarea name="text" rows="4" maxlength="2000" required></textarea></label></div>
        <button class="btn hot" type="submit">Send</button><p class="err" role="status" aria-live="polite"></p></form><div id="pzn-qs"></div></div>
      </div></div></section>`,
  });
}

export function routes(r, ctx) {
  r.get('/food/partners', (req, res) => respond(res, partners(ctx)));
  r.get('/food/manage/pitch', (req, res) => respond(res, notes(ctx), 200, { 'Cache-Control': 'no-store' }));
}
