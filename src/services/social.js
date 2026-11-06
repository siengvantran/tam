// Posting shows to TAM's Facebook Page and Google Business Profile, from
// /shows. Ported from christmas.tam.tv (bestchristmas/social.js).
//
// Facebook: Meta no longer lets apps create Page *events* (only partners such
// as Eventbrite can: connect TAM's Page in Eventbrite and listings appear as
// Facebook Events). This makes a Page *post* about the show with its link.
// Needs FACEBOOK_PAGE_ID and a long-lived FACEBOOK_PAGE_TOKEN with
// pages_manage_posts.
//
// Google: an EVENT post on TAM's Business Profile with the date, times, photo
// and a Book button. Needs GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN
// (OAuth, scope business.manage), GBP_ACCOUNT_ID and GBP_LOCATION_ID.
//
// Without them, /shows still writes the post and lets staff copy it and mark
// it as posted by hand.

import { fail } from '../lib/http.js';
import { longDate } from '../lib/content.js';
import { pounds } from '../../shared/pricing.js';

const addDay = (d, n = 1) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function socialPublisher(ctx, env = {}) {
  const fb = { page: env.FACEBOOK_PAGE_ID || '', token: env.FACEBOOK_PAGE_TOKEN || '', api: (env.FACEBOOK_API || 'https://graph.facebook.com/v21.0').replace(/\/$/, '') };
  const g = { id: env.GBP_CLIENT_ID || '', secret: env.GBP_CLIENT_SECRET || '', refresh: env.GBP_REFRESH_TOKEN || '', account: env.GBP_ACCOUNT_ID || '', location: env.GBP_LOCATION_ID || '',
    api: (env.GBP_API || 'https://mybusiness.googleapis.com/v4').replace(/\/$/, ''), tokenUrl: env.GBP_TOKEN_URL || 'https://oauth2.googleapis.com/token' };
  const enabled = () => ({ facebook: Boolean(fb.page && fb.token), google: Boolean(g.id && g.secret && g.refresh && g.account && g.location) });

  const link = (s, base) => `${base}/events/${s.slug}`;
  const image = (s, base) => (s.image ? (s.image.startsWith('http') ? s.image : `${base}${s.image}`) : `${base}/img/og.jpg`);
  function priceLine(s) {
    const sl = s.sales || {};
    if (sl.mode === 'rsvp' || sl.mode === 'none') return 'Free entry';
    const prices = (sl.tickets || []).map((t) => t.price).filter((p) => Number.isInteger(p));
    if (!prices.length) return 'Tickets';
    const lo = Math.min(...prices);
    return lo === 0 ? 'Free entry, with supporter tickets' : `Tickets from ${pounds(lo)}`;
  }

  // The suggested posts: who, when, why, and the link. Staff edit them before posting.
  function drafts(s, base) {
    const when = s.date ? `${longDate(s.date)}${s.doors ? ` · ${s.doors}` : ''}` : '';
    const lineup = (s.lineup || []).filter((x) => x.revealed !== false).map((x) => x.name).slice(0, 6);
    const facebook = [
      `${s.title} 🎶`,
      `${when} · TAM, Elephant & Castle`,
      '',
      s.summary || '',
      lineup.length ? `\nWith ${lineup.join(', ')}.` : '',
      '',
      `${priceLine(s)}: ${link(s, base)}`,
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const google = [s.summary || s.title, lineup.length ? `With ${lineup.join(', ')}.` : '', `${priceLine(s)}.`].filter(Boolean).join(' ').slice(0, 1500);
    return { facebook, google, link: link(s, base), image: image(s, base) };
  }

  async function postFacebook(s, message, base) {
    if (!enabled().facebook) throw fail(400, 'Facebook isn’t connected yet: set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_TOKEN on Railway. Until then, copy the post and mark it as posted.');
    const res = await fetch(`${fb.api}/${fb.page}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, link: link(s, base), access_token: fb.token }), signal: AbortSignal.timeout(30000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) throw fail(502, `Facebook: ${(json.error && json.error.message) || res.statusText}`);
    const [pageId, postId] = String(json.id).split('_');
    return { id: json.id, url: `https://www.facebook.com/${pageId}/posts/${postId || json.id}` };
  }

  let gAccess = { token: '', until: 0 };
  async function googleToken() {
    if (gAccess.token && Date.now() < gAccess.until) return gAccess.token;
    const res = await fetch(g.tokenUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: g.id, client_secret: g.secret, refresh_token: g.refresh, grant_type: 'refresh_token' }).toString(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw fail(502, `Google sign-in: ${json.error_description || json.error || res.statusText}`);
    gAccess = { token: json.access_token, until: Date.now() + ((json.expires_in || 3600) - 60) * 1000 };
    return gAccess.token;
  }
  const gDate = (d) => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) });
  const gTime = (t) => ({ hours: Number(t.slice(0, 2)), minutes: Number(t.slice(3, 5)) });

  async function postGoogle(s, text, base) {
    if (!enabled().google) throw fail(400, 'Google Business Profile isn’t connected yet: set the GBP_ settings on Railway. Until then, copy the post and mark it as posted.');
    const start = s.doors || '19:00', end = s.ends || '23:00';
    const post = {
      languageCode: 'en-GB', topicType: 'EVENT', summary: text.slice(0, 1500),
      event: { title: s.title.slice(0, 58), schedule: { startDate: gDate(s.date), startTime: gTime(start), endDate: gDate(end <= start ? addDay(s.date) : s.date), endTime: gTime(end) } },
      callToAction: { actionType: 'BOOK', url: link(s, base) },
      media: [{ mediaFormat: 'PHOTO', sourceUrl: image(s, base) }],
    };
    const res = await fetch(`${g.api}/accounts/${g.account}/locations/${g.location}/localPosts`, {
      method: 'POST', headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(post), signal: AbortSignal.timeout(30000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw fail(502, `Google: ${(json.error && json.error.message) || res.statusText}`);
    return { id: json.name || '', url: json.searchUrl || '' };
  }

  return { enabled, drafts, postFacebook, postGoogle };
}
