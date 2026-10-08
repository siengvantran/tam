// First-party data. Append-only JSON Lines files in DATA_DIR (mount a Railway
// volume there in production). Simple on purpose: the shape of each record is
// what matters, so moving to Postgres later is a straight import.
//
//   submissions.jsonl  "Play TAM" artist/event proposals
//   signups.jsonl      newsletter sign-ups (explicit consent recorded)
//   events.jsonl       consented analytics: page views and interactions

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export async function append(file, record) {
  await mkdir(DATA_DIR, { recursive: true });
  const row = { id: randomUUID(), at: new Date().toISOString(), ...record };
  await appendFile(path.join(DATA_DIR, file), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

export async function readAll(file) {
  try {
    const text = await readFile(path.join(DATA_DIR, file), 'utf8');
    return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const url = (v) => {
  const s = str(v, 500);
  if (!s) return '';
  try {
    const u = new URL(s);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : '';
  } catch { return ''; }
};

export function validateSubmission(body) {
  const s = {
    name: str(body.name, 120),
    email: str(body.email, 254).toLowerCase(),
    act: str(body.act, 120),
    genre: str(body.genre, 60),
    location: str(body.location, 120),
    links: [body.link1, body.link2, body.link3].map(url).filter(Boolean),
    proposal: str(body.proposal, 3000),
    strand: str(body.strand, 60),
    newsletter: body.newsletter === 'on' || body.newsletter === true,
  };
  const errors = {};
  if (!s.name) errors.name = 'Tell us your name.';
  if (!EMAIL.test(s.email)) errors.email = 'We need a valid email to reply.';
  if (!s.act) errors.act = 'What is the act called?';
  if (s.proposal.length < 20) errors.proposal = 'Tell us a little more (at least a sentence or two).';
  if (!s.links.length) errors.link1 = 'Add at least one link to your music or video.';
  if (body.privacy !== 'on' && body.privacy !== true) errors.privacy = 'Please confirm you have read the privacy notice.';
  return { value: s, errors, ok: Object.keys(errors).length === 0 };
}

export function validateSignup(body) {
  const email = str(body.email, 254).toLowerCase();
  const interests = [].concat(body.interests || []).map((x) => str(x, 40)).filter(Boolean).slice(0, 10);
  const errors = {};
  if (!EMAIL.test(email)) errors.email = 'Please enter a valid email.';
  if (body.consent !== 'on' && body.consent !== true) errors.consent = 'Tick the box so we know you want emails from TAM.';
  return { value: { email, interests, consent: true }, errors, ok: !Object.keys(errors).length };
}

// ---- Demand: "Bring them back" (artists) and "I was there" (past nights) ----
// Every press is a first-party signal: who people want to see again, and which
// nights people actually went to. Counts are public; emails never are.

export const DEMAND_TYPES = { 'bring-back': 'artist', 'was-there': 'event' };

export function validateDemand(body, exists) {
  const type = str(body.type, 20);
  const target = str(body.target, 120);
  const email = str(body.email, 254).toLowerCase();
  const errors = {};
  if (!DEMAND_TYPES[type]) errors.type = 'Unknown action.';
  else if (!exists(DEMAND_TYPES[type], target)) errors.target = 'Unknown artist or night.';
  if (email && !EMAIL.test(email)) errors.email = 'That email doesn’t look right.';
  if (email && body.consent !== 'on' && body.consent !== true) errors.consent = 'Tick the box so we can email you.';
  return { value: { type, target, ...(email ? { email, consent: true } : {}) }, errors, ok: !Object.keys(errors).length };
}

export async function demandCounts() {
  const counts = new Map();
  for (const r of await readAll('demand.jsonl')) {
    const k = `${r.type}:${r.target}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}
