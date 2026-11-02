// TAM.TV: wiring. Config → store → services → domains → routes → pages.

import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Router, HttpError, send, html, redirect, serveStatic, rateLimiter, baseUrl } from './lib/http.js';
import { openStore } from './lib/store.js';
import { loadContent, londonToday } from './lib/content.js';
import { stripeClient } from './services/stripe.js';
import { mailer } from './services/mailer.js';
import { ticketsDomain } from './domain/tickets.js';
import { communityDomain } from './domain/community.js';
import { collectionsDomain } from './domain/collections.js';
import { raffleDomain } from './domain/raffle.js';
import { adminDomain, staffAuth } from './domain/admin.js';
import { enquiriesDomain } from './domain/enquiries.js';
import { conciergeService } from './services/concierge.js';
import { readJson, text as cleanText } from './lib/http.js';
import * as pages from './views/pages.js';
import * as staff from './views/staff.js';
import * as pathwayPages from './views/pathways.js';
import { seoRoutes } from './views/seo.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const qr = createRequire(import.meta.url)('./lib/qr.cjs');

export function configFrom(env = process.env) {
  return {
    siteUrl: (env.SITE_URL || env.PUBLIC_URL || '').replace(/\/$/, ''),
    dataDir: path.resolve(env.DATA_DIR || path.join(ROOT, 'data')),
    adminToken: env.ADMIN_TOKEN || '',
    doorToken: env.DOOR_TOKEN || '',
    stripeKey: env.STRIPE_SECRET_KEY || '',
    stripeApi: env.STRIPE_API || 'https://api.stripe.com/v1',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    resendKey: env.RESEND_API_KEY || '',
    resendApi: env.RESEND_API || 'https://api.resend.com',
    mailFrom: env.MAIL_FROM || 'TAM <tickets@tam.tv>',
    mailReplyTo: env.MAIL_REPLY_TO || '',
    pinModeration: env.PIN_MODERATION !== 'off',
    holdMinutes: 30,
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    anthropicBaseUrl: env.ANTHROPIC_BASE_URL || '',
    aiModel: env.TAM_AI_MODEL || 'claude-opus-5-5',
    aiEffort: env.TAM_AI_EFFORT || 'low',
    agentDailyLimit: Number(env.AGENT_DAILY_LIMIT) || 1500,
    enquiriesTo: env.ENQUIRIES_TO || '',
  };
}

export async function createApp({ env = process.env, now = () => Date.now(), contentDir } = {}) {
  const cfg = configFrom(env);
  const content = loadContent(contentDir);
  const store = await openStore(cfg.dataDir);
  if (!store.db.meta.secret) { store.db.meta.secret = crypto.randomBytes(32).toString('hex'); await store.save(); }
  cfg.siteUrl = cfg.siteUrl || content.site.url || 'http://localhost:3000';

  const auth = staffAuth(cfg, store.db.meta.secret);
  const ctx = {
    db: store.db, save: store.save, saveImage: store.saveImage, content, cfg, now,
    secret: store.db.meta.secret,
    today: () => londonToday(new Date(now())),
    stripe: stripeClient(cfg.stripeKey, cfg.stripeApi),
    mail: mailer({ key: cfg.resendKey, from: cfg.mailFrom, replyTo: cfg.mailReplyTo, api: cfg.resendApi }),
    base: (req) => baseUrl(req, env.SITE_URL ? cfg.siteUrl : ''),
    ...auth,
  };
  if (!cfg.stripeKey) ctx.stripe.enabled = false;

  const tickets = ticketsDomain(ctx);
  const community = communityDomain(ctx);
  const collections = collectionsDomain(ctx, tickets);
  ctx.markOrderPaid = collections.markPaid;
  const raffle = raffleDomain(ctx, tickets);
  const admin = adminDomain(ctx, { tickets, collections, raffle });
  const enquiries = enquiriesDomain(ctx);
  const d = { tickets, community, collections, raffle, admin, enquiries, qr };
  const concierge = conciergeService(ctx, d);
  d.concierge = concierge;

  const api = new Router();
  for (const dom of [tickets, community, collections, raffle, admin, enquiries]) dom.routes(api);

  // Ask TAM: one visitor turn, streamed to the page as server-sent events.
  const agentLimited = rateLimiter({ max: 20 });
  api.post('/api/agent', async (req, res) => {
    if (agentLimited(req)) throw new HttpError(429, 'You’ve asked a lot in a short time. Try again in a few minutes.');
    const body = await readJson(req, 64 * 1024);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
    const emit = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    try {
      await concierge.respond({ history: body.history, pathway: cleanText(body.pathway, 40), page: cleanText(body.page, 200) }, emit);
    } catch (e) {
      if (!e.status) console.error('Concierge:', e);
      emit('error', { message: e.status ? e.message : 'Ask TAM hit a snag. Try again in a moment.' });
    }
    res.end();
  });

  const site = new Router();
  pages.routes(site, ctx, d);
  staff.routes(site, ctx, d);
  pathwayPages.routes(site, ctx, d);
  seoRoutes(site, ctx);

  const limited = rateLimiter({ max: 60 });

  async function handle(req, res) {
    res.req = req;
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    try {
      if (p.startsWith('/api/')) {
        if (req.method === 'POST' && !p.startsWith('/api/admin') && p !== '/api/stripe/webhook' && limited(req)) {
          throw new HttpError(429, 'Too many requests. Try again in a few minutes.');
        }
        const m = api.match(req.method, p);
        if (!m) throw new HttpError(404, 'Not found.');
        return await m.handler(req, res, { url, params: m.params });
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        for (const [prefix, dir, cache] of [
          ['/css/', 'public/css', 'no-cache'], ['/js/', 'public/js', 'no-cache'], ['/shared/', 'shared', 'no-cache'],
          ['/img/', 'public/img', 'public, max-age=86400'],
        ]) {
          if (p.startsWith(prefix) && await serveStatic(res, path.join(ROOT, dir), p.slice(prefix.length), cache)) return;
        }
        if (p.startsWith('/uploads/') && await serveStatic(res, store.uploads, p.slice(9), 'public, max-age=86400')) return;
        if (p === '/favicon.ico') return serveStatic(res, path.join(ROOT, 'public/img'), 'favicon-48.png');
      }
      const m = site.match(req.method, p);
      if (m) return await m.handler(req, res, { url, params: m.params });
      // Every page of the old www.tam.tv still answers at its address.
      const old = content.legacyBy.get(p) || content.legacyBy.get(p.replace(/\/$/, ''));
      if (old && (req.method === 'GET' || req.method === 'HEAD')) return pages.legacyPage(req, res, ctx, old);
      return html(res, pages.notFound(ctx), 404);
    } catch (e) {
      const status = e instanceof HttpError || e.status ? e.status : 500;
      if (status >= 500) console.error(e);
      const message = status >= 500 && !(e instanceof HttpError) ? 'Something went wrong. Please try again.' : e.message;
      if (p.startsWith('/api/')) return send(res, status, { error: message, ...(e.extra || {}) });
      return html(res, pages.errorPage(ctx, status, message), status);
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  return {
    store, ctx, server, handle,
    listen: (port, cb) => server.listen(port, cb),
  };
}

export { redirect };
