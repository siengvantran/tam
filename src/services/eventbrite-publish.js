// Listing TAM's shows on Eventbrite, from /shows. Ported from christmas.tam.tv
// (bestchristmas/eventbrite.js), which has run TAM's festival listings.
//
// A listing is created as a draft with the show's title, times, description,
// image and ticket types, then published as a separate step. Tickets sold on
// Eventbrite aren't visible here in real time, so a listing holds an
// allocation that comes out of the show's capacity: TAM's box office sells
// the rest, and nothing is sold twice (see showNight in src/lib/content.js).
// The listing is saved before its ticket types are made, so a retry never
// makes a second draft.
//
// Needs EVENTBRITE_TOKEN (a private token: eventbrite.co.uk → Account settings
// → Developer links → API keys, made while signed in to the account that owns
// TAM's organiser page). EVENTBRITE_ORGANIZER defaults to TAM's organiser
// profile; EVENTBRITE_ORG_ID is looked up when not set. EVENTBRITE_API is for
// tests.
//
// Eventbrite also publishes to Facebook: connect TAM's Facebook Page once in
// Eventbrite (Account settings → Facebook) and every published listing
// appears as a Facebook Event too.

import fs from 'node:fs/promises';
import path from 'node:path';
import { londonToUtc } from '../lib/content.js';
import { fail } from '../lib/http.js';

const MAX_PER_ORDER = 10;
const esc = (v) => String(v || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const addDay = (d) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const z = (iso) => iso.replace(/\.\d+Z$/, 'Z');

// Eventbrite's summary is 140 characters: whole sentences where they fit.
export function short(v, max = 140) {
  v = String(v || '');
  if (v.length <= max) return v;
  const cut = v.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end >= 60 ? cut.slice(0, end + 1) : `${v.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

// Width and height of a JPEG or PNG, for the 2:1 crop.
function imageSize(buf) {
  if (buf.subarray(1, 4).toString() === 'PNG') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  throw new Error('Use a JPG or PNG image for Eventbrite.');
}

export function eventbritePublisher(ctx, { token = '', api = 'https://www.eventbriteapi.com/v3', organizer = '33409225909', orgId = '', publicDir, uploadsDir } = {}) {
  const API = api.replace(/\/$/, '');
  let resolved = null;
  const venueName = () => { const v = ctx.content.venueBy.get(ctx.content.site.defaultVenue); return v ? v.name : 'TAM'; };

  async function eb(method, endpoint, body) {
    if (!token) throw fail(400, 'Eventbrite isn’t connected yet: set EVENTBRITE_TOKEN on Railway.');
    const res = await fetch(`${API}/${endpoint.replace(/^\//, '')}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw fail(502, `Eventbrite: ${json.error_description || json.error || res.statusText}`);
    return json;
  }

  async function account() {
    if (!token) return { connected: false, organizer };
    const me = await eb('GET', 'users/me/');
    const orgs = (await eb('GET', 'users/me/organizations/')).organizations || [];
    for (const o of orgs) o.organizers = (await eb('GET', `organizations/${o.id}/organizers/`).catch(() => ({}))).organizers || [];
    const owns = orgs.some((o) => (o.organizers || []).some((x) => String(x.id) === String(organizer)));
    return { connected: true, owns, organizer, user: [me.name, ((me.emails || [])[0] || {}).email].filter(Boolean).join(' · '),
      organizations: orgs.map((o) => ({ id: o.id, name: o.name, organizers: o.organizers.map((x) => ({ id: x.id, name: x.name })) })) };
  }

  async function organization() {
    if (resolved) return resolved;
    const acc = await account();
    const org = acc.organizations.find((o) => (!orgId || o.id === orgId) && o.organizers.some((x) => String(x.id) === String(organizer)));
    if (!org) {
      const can = acc.organizations.flatMap((o) => o.organizers.map((x) => `${x.name} (${x.id})`)).join(', ') || 'none';
      throw fail(400, `Eventbrite: this token (${acc.user || 'unknown login'}) can’t use TAM’s organiser page ${organizer}. It can use: ${can}. Make the token while signed in to the account that owns TAM’s page.`);
    }
    resolved = org.id;
    return resolved;
  }

  async function venueId() {
    const org = await organization();
    const m = ctx.db.meta.eventbriteVenue;
    if (m && m.org === org) return m.id;
    const v = ctx.content.venueBy.get(ctx.content.site.defaultVenue) || {};
    const addr = String(v.address || '42 Newington Causeway, London SE1 6DR');
    const pc = (/[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}/i.exec(addr) || ['SE1 6DR'])[0];
    const made = await eb('POST', `organizations/${org}/venues/`, { venue: { name: venueName(), address: { address_1: v.place || 'Mercato Metropolitano', address_2: addr.replace(/,?\s*London.*$/i, ''), city: 'London', postal_code: pc, country: 'GB' } } });
    ctx.db.meta.eventbriteVenue = { id: made.id, org };
    return made.id;
  }

  // The show's image on Eventbrite, cropped 2:1 from the top so faces stay in.
  async function uploadImage(src) {
    if (!src) return null;
    const file = src.startsWith('/uploads/') ? path.join(uploadsDir, src.slice(9)) : path.join(publicDir, src.replace(/^\//, ''));
    const buf = await fs.readFile(file);
    const { width, height } = imageSize(buf);
    const up = await eb('GET', 'media/upload/?type=image-event-logo');
    const form = new FormData();
    for (const [k, v] of Object.entries(up.upload_data || {})) form.append(k, String(v));
    form.append(up.file_parameter_name || 'file', new Blob([buf], { type: file.endsWith('.png') ? 'image/png' : 'image/jpeg' }), path.basename(file));
    const s3 = await fetch(up.upload_url, { method: up.upload_method || 'POST', body: form });
    if (!s3.ok) throw new Error(`the image upload was refused (${s3.status})`);
    const w = Math.min(width, height * 2), h = Math.round(w / 2);
    return (await eb('POST', 'media/upload/', { upload_token: up.upload_token, crop_mask: { top_left: { x: Math.round((width - w) / 2), y: 0 }, width: w, height: h } })).id;
  }

  const times = (s) => {
    const start = s.doors || '19:00', end = s.ends || '23:00';
    return { start: { timezone: 'Europe/London', utc: z(londonToUtc(s.date, start)) }, end: { timezone: 'Europe/London', utc: z(londonToUtc(end <= start ? addDay(s.date) : s.date, end)) } };
  };

  // The listing's description: the show's own words, line-up, running order, venue and link.
  function descriptionHtml(s, base) {
    const v = ctx.content.venueBy.get(ctx.content.site.defaultVenue) || {};
    const paras = String(s.description || s.summary || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const lineup = (s.lineup || []).filter((x) => x.revealed !== false);
    return [
      s.presenters ? `<p><strong>${esc(s.presenters)}</strong></p>` : '',
      ...paras.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`),
      lineup.length ? `<p><strong>Line-up</strong></p><ul>${lineup.map((x) => `<li>${esc(x.name)}${x.role ? ` · ${esc(x.role)}` : ''}</li>`).join('')}</ul>` : '',
      (s.schedule || []).length ? `<p><strong>Running order</strong></p><ul>${s.schedule.map(([t, w]) => `<li>${esc(t)}${t ? ' · ' : ''}${esc(w)}</li>`).join('')}</ul>` : '',
      `<p>${esc(venueName())}${v.address ? `, ${esc(v.address)}` : ''}.${v.stations ? ` Nearest: ${esc(v.stations)}.` : ''}</p>`,
      `<p>More about the night: <a href="${esc(`${base}/events/${s.slug}`)}">${esc(`${base}/events/${s.slug}`)}</a></p>`,
    ].filter(Boolean).join('');
  }

  async function setDescription(l, s, base) {
    const text = { type: 'text', data: { body: { type: 'text', text: descriptionHtml(s, base), alignment: 'left' } } };
    const video = s.video ? { type: 'video', data: { video: { url: `https://www.youtube.com/watch?v=${s.video}`, display_size: 'large' } } } : null;
    let last;
    for (const modules of video ? [[text, video], [text]] : [[text]]) {
      try {
        const cur = await eb('GET', `events/${l.id}/structured_content/`).catch(() => ({}));
        await eb('POST', `events/${l.id}/structured_content/${Number(cur.page_version_number || 0) + 1}/`, { modules, publish: true, purpose: 'listing' });
        l.mediaNote = video && modules.length === 1 ? `Eventbrite didn’t take the video: ${last && last.message}` : '';
        return;
      } catch (e) { last = e; }
    }
    throw last;
  }

  // Tickets for the listing: the show's ticket types (free ones as free), each up to the allocation.
  function ticketTypes(s) {
    const sl = s.sales || {};
    if (sl.mode === 'rsvp') return [{ key: 'guest', name: 'Guest list', price: 0, description: 'Free entry: your name on the door.' }];
    return (sl.tickets || []).map((t) => ({ key: t.id, name: t.name, price: t.price, description: t.blurb || '' }));
  }

  function allocationFor(s, soldHere, current = 0) {
    const sl = s.sales || {};
    const cap = Number(sl.capacity) || 0;
    const a = sl.mode === 'eventbrite' ? cap : Number(sl.eventbriteAllocation) || 0;
    if (!a) throw fail(400, sl.mode === 'eventbrite' ? 'Set the capacity first.' : 'Set how many tickets go on Eventbrite.');
    if (sl.mode !== 'eventbrite' && a + soldHere > cap) throw fail(400, `Only ${Math.max(0, cap - soldHere)} tickets are left to put on Eventbrite (${soldHere} already booked on tam.tv).`);
    if (a < (current || 0)) throw fail(400, `${current} tickets are already sold on Eventbrite.`);
    return a;
  }

  const ticketBody = (t, allocation, created) => ({ ticket_class: {
    name: t.name, description: String(t.description || '').slice(0, 2500), quantity_total: allocation,
    ...(t.price ? { cost: `GBP,${t.price}`, free: false } : { free: true }),
    ...(created ? {} : { minimum_quantity: 1, maximum_quantity: MAX_PER_ORDER }),
  } });

  async function create(s, { base, soldHere = 0 }) {
    if (s.eventbrite && !['canceled', 'deleted'].includes(s.eventbrite.status)) throw fail(409, 'This show is already on Eventbrite.');
    if (!s.title || !s.date || !s.doors) throw fail(400, 'Give the show a title, date and start time first.');
    const allocation = allocationFor(s, soldHere);
    const types = ticketTypes(s);
    if (!types.length) throw fail(400, 'Add a ticket type first.');
    const venue = await venueId();
    let logo = null, imageNote = '';
    try { logo = await uploadImage(s.image); } catch (e) { imageNote = e.message; console.warn(`Eventbrite image for ${s.id}: ${e.message}`); }
    const ev = await eb('POST', `organizations/${await organization()}/events/`, { event: {
      name: { html: esc(s.title) }, summary: short(s.summary), ...times(s), currency: 'GBP', capacity: allocation,
      organizer_id: organizer, venue_id: venue, online_event: false, listed: true, shareable: true, ...(logo ? { logo_id: logo } : {}),
    } });
    const l = { id: String(ev.id), url: ev.url || '', status: ev.status || 'draft', allocation, tickets: {}, sold: 0, image: Boolean(logo), imageNote, createdAt: new Date(ctx.now()).toISOString() };
    s.eventbrite = l; // kept even if a later step fails, so it's never created twice
    try {
      for (const t of types) l.tickets[t.key] = (await eb('POST', `events/${l.id}/ticket_classes/`, ticketBody(t, allocation))).id;
      await setDescription(l, s, base);
      delete l.error;
    } catch (e) { l.error = e.message; throw e; }
    return l;
  }

  async function update(s, { base, soldHere = 0 }) {
    const l = s.eventbrite;
    if (!l) throw fail(404, 'This show isn’t on Eventbrite yet.');
    const linked = Boolean(l.linked);
    const allocation = linked ? 0 : allocationFor(s, soldHere, l.sold);
    let logo = null;
    if (!l.image && s.image) { try { logo = await uploadImage(s.image); l.image = true; l.imageNote = ''; } catch (e) { l.imageNote = e.message; } }
    await eb('POST', `events/${l.id}/`, { event: { name: { html: esc(s.title) }, summary: short(s.summary), ...times(s), ...(linked ? {} : { capacity: allocation }), ...(logo ? { logo_id: logo } : {}) } });
    if (!linked) {
      for (const t of ticketTypes(s)) {
        if (l.tickets[t.key]) await eb('POST', `events/${l.id}/ticket_classes/${l.tickets[t.key]}/`, ticketBody(t, allocation, true));
        else l.tickets[t.key] = (await eb('POST', `events/${l.id}/ticket_classes/`, ticketBody(t, allocation))).id;
      }
      l.allocation = allocation;
    }
    await setDescription(l, s, base);
    l.updatedAt = new Date(ctx.now()).toISOString();
    delete l.error;
    return l;
  }

  async function publish(s) {
    const l = s.eventbrite;
    if (!l) throw fail(404, 'This show isn’t on Eventbrite yet.');
    if (l.error) throw fail(400, 'Fix the listing first: press Update.');
    if (s.status !== 'published') throw fail(400, 'Publish the show on tam.tv first, so both go live together.');
    await eb('POST', `events/${l.id}/publish/`);
    l.status = 'live';
    return l;
  }

  async function refresh(s) {
    const l = s.eventbrite;
    if (!l) throw fail(404, 'This show isn’t on Eventbrite yet.');
    const ev = await eb('GET', `events/${l.id}/?expand=ticket_classes`);
    l.status = ev.status || l.status;
    l.url = ev.url || l.url;
    l.sold = (ev.ticket_classes || []).reduce((n, t) => n + (t.quantity_sold || 0), 0);
    l.syncedAt = new Date(ctx.now()).toISOString();
    return l;
  }

  async function cancel(s) {
    const l = s.eventbrite;
    if (!l) throw fail(404, 'This show isn’t on Eventbrite.');
    if (l.status === 'draft') await eb('DELETE', `events/${l.id}/`).catch(() => eb('POST', `events/${l.id}/cancel/`));
    else await eb('POST', `events/${l.id}/cancel/`);
    l.status = l.status === 'draft' ? 'deleted' : 'canceled';
    return l;
  }

  return { enabled: () => Boolean(token), account, create, update, publish, refresh, cancel, descriptionHtml };
}
