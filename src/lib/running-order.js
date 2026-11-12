// A Sunday Showcase's running order, worked out as a show rather than a list.
//
// The draft is arranged by each act's vibe, from the warmest opener to the
// loudest closer: the quiet sets play while the room is listening and before
// the drums arrive, each half ends on a high, and the big changeover happens
// once, at the end. Staff (Vivian) adjust it in /sunday-showcases/manage,
// tick each act off at sound check, and only then publish the times.
//
// Suggestions come from how visitors react to each act on the site (page
// views, Christmas votes, invites sent, follows, clips played, presents
// unwrapped), and are only offered when a change keeps the show's shape.

// How much energy each vibe brings to the room, low to high.
export const ENERGY = { campfire: 1, mist: 2, noir: 3, spotlight: 4, stage: 4, pop: 5, disco: 5, riot: 6 };
const energy = (a) => ENERGY[(a && a.vibe) || 'stage'] || 4;

const VIBE_WHY = {
  campfire: 'warm and acoustic, easy for a room to settle into',
  mist: 'atmospheric and intimate, so it needs a room that is still listening',
  noir: 'dark and intense: a set people talk about',
  spotlight: 'a big, theatrical voice that takes hold of a room',
  stage: 'a strong all-round set',
  disco: 'feel-good and danceable: this is where people start moving',
  pop: 'big hooks and feel-good pop: this is where people start singing along',
  riot: 'the loudest set of the night, with a full band',
};

export const DEFAULTS = { mins: 20, changeover: 5, bigChangeover: 10, interval: 15, startAfterDoors: 20 };

const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const toTime = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export const isTime = (t) => toMin(t) !== null && toMin(t) < 24 * 60;

// The draft: quietest to loudest, an interval halfway, the night's times.
export function autoArrange(acts, { doors = '19:30', ends = '22:30' } = {}) {
  const named = acts.filter((a) => !a.tba);
  const order = [...named].sort((x, y) => energy(x) - energy(y) || x.n - y.n);
  const half = Math.ceil(order.length / 2) - 1;
  const start = toTime((toMin(doors) ?? toMin('19:30')) + DEFAULTS.startAfterDoors);
  const slots = order.map((a, i) => ({
    slug: a.slug, mins: DEFAULTS.mins, soundcheck: false,
    changeover: i === 0 ? 0 : (energy(a) >= ENERGY.riot ? DEFAULTS.bigChangeover : DEFAULTS.changeover),
  }));
  const run = { status: 'draft', start, end: isTime(ends) ? ends : '22:30', interval: { after: order.length > 2 ? half : -1, mins: DEFAULTS.interval }, slots };
  run.slots.forEach((s, i) => { s.why = whyFor(run, i, bySlug(named)); });
  return run;
}

const bySlug = (acts) => new Map(acts.filter((a) => !a.tba).map((a) => [a.slug, a]));

// Why an act is where it is, in plain words.
export function whyFor(run, i, acts) {
  const s = run.slots, a = acts.get(s[i].slug), last = s.length - 1, after = run.interval.after;
  const name = a ? a.name : s[i].slug, vibe = VIBE_WHY[(a && a.vibe) || 'stage'];
  const role = i === 0 ? 'Opens the night'
    : i === last ? 'Closes the night: it ends on the peak, and the biggest changeover happens once, at the end'
      : i === after ? 'Closes the first half, so people go to the bar talking about it'
        : i === after + 1 ? 'Restarts the second half: a confident set to win back a room coming back from the bar'
          : i < after ? 'Builds the first half' : 'Lifts the second half towards the closer';
  return `${role}. ${name} is ${vibe}.`;
}

// Set times from the start time, each set's length, changeovers and the interval.
export function withTimes(run) {
  let t = toMin(run.start) ?? toMin('19:50');
  let intervalAt = null;
  const slots = run.slots.map((s, i) => {
    // the set after the interval needs no changeover of its own: that happens in the interval
    if (i > 0 && i !== run.interval.after + 1) t += Math.max(0, Number(s.changeover) || 0);
    const on = t; t += Math.max(1, Number(s.mins) || DEFAULTS.mins);
    const out = { ...s, on: toTime(on), off: toTime(t) };
    if (i === run.interval.after && i < run.slots.length - 1) { intervalAt = { from: toTime(t), to: toTime(t + run.interval.mins) }; t += run.interval.mins; }
    return out;
  });
  const end = toMin(run.end);
  return { ...run, slots, intervalAt, finish: toTime(t), over: end === null ? 0 : Math.max(0, t - end), spare: end === null ? 0 : Math.max(0, end - t) };
}

// Things to look at before publishing: timing and the show's shape.
export function checks(run, acts) {
  const m = bySlug(acts), t = withTimes(run), out = [];
  if (t.over) out.push({ level: 'warn', text: `Runs ${t.over} minutes past the ${run.end} finish. Shorten a set or a changeover.` });
  // the night opens warm: one of the gentlest sets, not the darkest or loudest
  const first = m.get((run.slots[0] || {}).slug);
  const gentlest = Math.min(...run.slots.map((s) => energy(m.get(s.slug))));
  if (first && energy(first) > gentlest + 1) out.push({ level: 'warn', text: `${first.name} opens the night, but a gentler set would settle the room first.` });
  const halfOf = (i) => (run.interval.after >= 0 && i > run.interval.after ? 2 : 1);
  run.slots.forEach((s, i) => {
    if (!i) return;
    const p = m.get(run.slots[i - 1].slug), a = m.get(s.slug);
    if (!p || !a || halfOf(i) !== halfOf(i - 1)) return;
    if (energy(p) >= ENERGY.riot && energy(a) < energy(p)) out.push({ level: 'warn', text: `${a.name} follows ${p.name}: a quieter set straight after the loudest one is hard to hear.` });
    else if (energy(a) <= energy(p) - 2) out.push({ level: 'info', text: `${a.name} is a big drop in energy after ${p.name}. Fine for a breather, but check it's on purpose.` });
  });
  const unchecked = run.slots.filter((s) => !s.soundcheck).map((s) => (m.get(s.slug) || {}).name || s.slug);
  if (unchecked.length) out.push({ level: 'hold', text: `Not sound-checked yet: ${unchecked.join(', ')}. The running order can be published once every act has sound-checked.` });
  return out;
}

const SIGNALS = ['view', 'vote', 'invite', 'follow', 'play', 'unwrap'];
// How much each kind of reaction counts: a Christmas vote or an invite sent says far more than a page view.
const WEIGHT = { vote: 5, invite: 4, follow: 2, play: 1, unwrap: 0.5 };
export const score = (s) => Object.entries(WEIGHT).reduce((n, [k, w]) => n + (s[k] || 0) * w, 0);

// Each act's numbers, with a score and how it ranks.
export function metrics(acts, signals = {}, wants = {}) {
  const rows = acts.filter((a) => !a.tba).map((a) => {
    const s = { ...Object.fromEntries(SIGNALS.map((k) => [k, (signals[a.slug] || {})[k] || 0])), vote: (wants[a.slug] || {}).count || 0 };
    return { slug: a.slug, name: a.name, vibe: a.vibe || 'stage', ...s, score: score(s), perView: s.view ? +(score(s) / s.view).toFixed(2) : 0 };
  });
  const ranked = [...rows].sort((x, y) => y.score - x.score);
  rows.forEach((r) => { r.rank = ranked.indexOf(r) + 1; });
  return rows;
}

const MIN_VIEWS = 30;
const shapeOk = (run, acts) => !checks(run, acts).some((c) => c.level === 'warn' && !/past the/.test(c.text));

// Changes the numbers point to, only where they keep the show's shape.
export function suggest(run, acts, rows) {
  const out = [], last = run.slots.length - 1, after = run.interval.after;
  const views = rows.reduce((n, r) => n + r.view, 0);
  if (views < MIN_VIEWS) {
    out.push({ kind: 'info', text: `Not enough visitors yet to read the crowd: ${views} act page views so far. Suggestions firm up once about ${MIN_VIEWS} people have looked at the acts.` });
  }
  const row = new Map(rows.map((r) => [r.slug, r]));
  const at = (i) => row.get(run.slots[i].slug) || { score: 0, name: run.slots[i].slug };
  const peaks = [after, last].filter((i) => i >= 0 && i < run.slots.length);
  if (views >= MIN_VIEWS) {
    // the crowd's favourite should hold a peak slot: the end of a half
    for (const p of peaks) {
      const half = p === after ? [0, after] : [after + 1, last];
      let best = half[0];
      for (let i = half[0]; i <= half[1]; i++) if (at(i).score > at(best).score) best = i;
      if (best !== p && at(best).score > at(p).score * 1.25) {
        const trial = { ...run, slots: [...run.slots] };
        [trial.slots[best], trial.slots[p]] = [trial.slots[p], trial.slots[best]];
        if (shapeOk(trial, acts)) {
          out.push({ kind: 'swap', swap: [best, p], text: `Swap ${at(best).name} and ${at(p).name}: ${at(best).name} is getting the strongest reaction in this half (score ${at(best).score} against ${at(p).score}), so give them the ${p === last ? 'closing' : 'end-of-first-half'} slot.` });
        } else {
          out.push({ kind: 'info', text: `${at(best).name} is getting a stronger reaction than ${at(p).name}, but swapping them would break the show's shape (loud before quiet), so it stays as it is.` });
        }
      }
    }
    // looked at a lot, but few votes: a prompt for the host
    rows.filter((r) => r.view >= 10 && r.vote / r.view < 0.05).forEach((r) => out.push({ kind: 'info', text: `Lots of people look at ${r.name}'s page (${r.view} views) but few vote for them at Christmas. Ask the host to plug the vote after their set.` }));
    const fav = [...rows].sort((x, y) => y.vote - x.vote)[0];
    if (fav && fav.vote >= 3) out.push({ kind: 'info', text: `${fav.name} has the most Christmas votes (${fav.vote}): a strong pick for the Christmas Showcase Special.` });
  }
  return out;
}

// Re-word every act's "why" after the order changes (keeps any reason staff wrote themselves).
export function rewhy(run, acts, { keepCustom = true } = {}) {
  const m = bySlug(acts);
  run.slots.forEach((s, i) => { if (!keepCustom || !s.whyCustom) s.why = whyFor(run, i, m); });
  return run;
}
