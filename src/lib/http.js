// Small HTTP toolkit: a router, JSON and HTML responses, body parsing,
// errors that carry a status, rate limiting and static files. No dependencies.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const fail = (status, message, extra) => new HttpError(status, message, extra);

// Routes look like 'GET /events/:slug'. A trailing '*' matches the rest of the path.
export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    const keys = [];
    const rx = new RegExp('^' + pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\/\*$/, '/(?<rest>.*)')
      .replace(/:(\w+)/g, (_, k) => { keys.push(k); return `(?<${k}>[^/]+)`; }) + '$');
    this.routes.push({ method, rx, handler });
    return this;
  }
  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const m = r.rx.exec(pathname);
      if (m) {
        const params = {};
        for (const [k, v] of Object.entries(m.groups || {})) {
          try { params[k] = decodeURIComponent(v); } catch { params[k] = v; }
        }
        return { handler: r.handler, params };
      }
    }
    return null;
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://www.youtube.com https://s.ytimg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://i.ytimg.com https://img.evbuc.com https://cdn.evbuc.com",
    "media-src 'self' blob:",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
    "connect-src 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "base-uri 'self'",
  ].join('; '),
};

// With Google Analytics or Tag Manager switched on (GA_MEASUREMENT_ID / GTM_ID),
// the policy lets in Google's tag script and the hits it sends, the hosts
// Google lists for GA4 and Tag Manager. The tag still loads only after a yes
// on the cookie banner (public/js/consent.js).
export function allowAnalytics() {
  const add = { 'script-src': 'https://*.googletagmanager.com', 'img-src': 'https://*.google-analytics.com https://*.googletagmanager.com',
    'connect-src': 'https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com' };
  SECURITY_HEADERS['Content-Security-Policy'] = SECURITY_HEADERS['Content-Security-Policy'].split('; ').map((d) => {
    const name = d.split(' ')[0];
    return add[name] && !d.includes(add[name].split(' ')[0]) ? `${d} ${add[name]}` : d;
  }).join('; ');
}

export function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  let payload = body;
  const h = { ...SECURITY_HEADERS, ...headers };
  if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) {
    payload = JSON.stringify(body);
    h['Content-Type'] = h['Content-Type'] || 'application/json; charset=utf-8';
    h['Cache-Control'] = h['Cache-Control'] || 'no-store';
  }
  res.writeHead(status, h);
  res.end(res.req && res.req.method === 'HEAD' ? undefined : payload);
}

export const html = (res, body, status = 200, headers = {}) =>
  send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...headers });

export const redirect = (res, location, status = 302) => send(res, status, '', { Location: location });

export function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(fail(413, 'That is too large to send.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req, limit = 16 * 1024) {
  const raw = await readRaw(req, limit);
  if (!raw.length) return {};
  try {
    const v = JSON.parse(raw.toString('utf8'));
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch { throw fail(400, 'Send a JSON object.'); }
}

// ----- input cleaning -----
export function text(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}
export function email(v) {
  const s = text(v, 200).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : '';
}
export function website(v) {
  let s = text(v, 200);
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : '';
  } catch { return ''; }
}

// ----- ids and keys -----
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
export function newId(prefix, n = 6) {
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}-${s}` : s;
}
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ----- rate limiting: a sliding window per client address -----
export function rateLimiter({ windowMs = 10 * 60 * 1000, max = 60 } = {}) {
  const hits = new Map();
  return (req) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return list.length > max;
  };
}

export function baseUrl(req, configured) {
  if (configured) return configured;
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  return `${proto}://${req.headers.host || 'localhost'}`;
}

// ----- static files -----
export const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8', '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8',
};

export async function serveStatic(res, root, rel, cache = 'public, max-age=3600') {
  const file = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  if (!file.startsWith(path.resolve(root) + path.sep)) return false;
  let stat;
  try { stat = await fs.stat(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const body = await fs.readFile(file);
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  // Byte ranges: Safari (every iPhone) only plays video from a server that answers them.
  const range = /^bytes=(\d*)-(\d*)$/.exec(String((res.req && res.req.headers.range) || ''));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    if (start >= body.length || start > end) {
      send(res, 416, '', { 'Content-Range': `bytes */${body.length}`, 'Accept-Ranges': 'bytes' });
      return true;
    }
    const part = body.subarray(start, end + 1);
    send(res, 206, part, { 'Content-Type': type, 'Cache-Control': cache, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': part.length });
    return true;
  }
  send(res, 200, body, {
    'Content-Type': type,
    'Cache-Control': cache,
    'Accept-Ranges': 'bytes',
    'Content-Length': body.length,
  });
  return true;
}
