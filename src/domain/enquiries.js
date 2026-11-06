// Enquiries: hiring the venue, a party, pitching a night, sponsorship.
// They come from pathway forms or from the Ask TAM concierge, land in /admin,
// and (with ENQUIRIES_TO and email set up) are emailed to the box office.

import { fail, send, readJson, text, email, newId } from '../lib/http.js';
import { ENQUIRY_KINDS } from '../lib/content.js';
import { escape } from '../views/html.js';

export const KIND_NAMES = { 'venue-hire': 'Venue hire', party: 'Party', perform: 'Play at TAM', sponsor: 'Sponsorship', other: 'Something else' };

export function enquiriesDomain(ctx) {
  const { db, save, cfg } = ctx;

  // Shared by the form and the concierge. Returns the saved enquiry or throws a 400.
  async function create(input, source) {
    const e = {
      id: newId('ENQ'), createdAt: new Date(ctx.now()).toISOString(), source,
      kind: ENQUIRY_KINDS.includes(input.kind) ? input.kind : 'other',
      name: text(input.name, 80), email: email(input.email), phone: text(input.phone, 30),
      date: text(input.date, 40), guests: text(String(input.guests ?? ''), 20), budget: text(input.budget, 40),
      company: text(input.company, 80), message: text(input.message, 2000), pathway: text(input.pathway, 40),
      status: 'new',
    };
    if (!e.name) throw fail(400, 'Add your name.');
    if (!e.email) throw fail(400, 'Add a valid email address.');
    if (!e.message && !e.date) throw fail(400, 'Tell us a little about what you have in mind.');
    db.enquiries.push(e);
    await save();
    notify(e);
    return e;
  }

  async function notify(e) {
    if (!cfg.enquiriesTo || !ctx.mail.enabled()) return;
    const rows = [['Kind', KIND_NAMES[e.kind]], ['Name', e.name], ['Email', e.email], ['Phone', e.phone], ['Company', e.company], ['Date', e.date], ['Guests', e.guests], ['Budget', e.budget], ['Came from', e.source === 'agent' ? 'Ask TAM concierge' : `the ${e.pathway || 'site'} form`]].filter(([, v]) => v);
    try {
      await ctx.mail.send({
        to: cfg.enquiriesTo, replyTo: e.email, // Reply goes straight to the person who enquired
        subject: `New enquiry (${KIND_NAMES[e.kind]}): ${e.name} · ${e.id}`,
        html: `<h2>${escape(KIND_NAMES[e.kind])} enquiry</h2><table>${rows.map(([k, v]) => `<tr><td>${escape(k)}</td><td><b>${escape(v)}</b></td></tr>`).join('')}</table><p>${escape(e.message).replace(/\n/g, '<br>')}</p><p><a href="${cfg.siteUrl}/admin">Open admin</a></p>`,
        text: `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${e.message}`,
      });
      e.emailedAt = new Date(ctx.now()).toISOString();
      await save();
    } catch (err) { console.warn(`Enquiry email ${e.id}: ${err.message}`); }
  }

  function routes(r) {
    r.post('/api/enquiries', async (req, res) => {
      const e = await create(await readJson(req, 8 * 1024), 'form');
      send(res, 201, { id: e.id });
    });
    r.post('/api/admin/enquiries/:id', async (req, res, { params }) => {
      if (!ctx.isAdmin(req)) throw fail(401, 'Wrong admin token.');
      const e = db.enquiries.find((x) => x.id === params.id);
      if (!e) throw fail(404, 'Enquiry not found.');
      const { status } = await readJson(req, 1024);
      if (!['new', 'replied', 'quoted', 'booked', 'closed'].includes(status)) throw fail(400, 'Unknown status.');
      e.status = status;
      await save();
      send(res, 200, { ok: true });
    });
  }

  return { routes, create };
}
