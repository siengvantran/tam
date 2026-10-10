// The Production Agent: turns one TAM night into a content package.
// "One event should generate an ecosystem of content."
//
// Given an artist, an event and the producer's notes from the night, Claude
// drafts the profile, platform-specific captions, SEO metadata, clip ideas,
// interview questions and story angles. A human edits before anything ships.
//
// Optional: without ANTHROPIC_API_KEY the rest of the site works and the
// studio explains how to switch it on.

import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.TAM_AI_MODEL || 'claude-opus-5-5';

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client;
const getClient = () => (client ??= new Anthropic());

const SYSTEM = `You are the Production Agent for TAM.TV, the media platform of TAM (Temple of Art and Music), a live music venue and festival in Elephant & Castle, London that champions emerging artists and hosts cult legends.

Editorial voice: real, immediate, human. Warm and specific, never corporate or hype-heavy. British English. No invented facts: use only what the producer gives you about the artist and the night, and where something is unknown write around it rather than guessing. Every caption should point people back to the artist's page on TAM.TV.`;

const str = { type: 'string' };
const list = { type: 'array', items: str };

export const PACKAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'profile', 'seo', 'captions', 'clipIdeas', 'interviewQuestions', 'storyAngles'],
  properties: {
    headline: str,
    profile: str,
    seo: { type: 'object', additionalProperties: false, required: ['title', 'description'], properties: { title: str, description: str } },
    captions: {
      type: 'object',
      additionalProperties: false,
      required: ['instagram', 'tiktok', 'youtube', 'x'],
      properties: { instagram: str, tiktok: str, youtube: str, x: str },
    },
    clipIdeas: list,
    interviewQuestions: list,
    storyAngles: list,
  },
};

export function buildPrompt({ artist, event, notes, pageUrl }) {
  return [
    'Build the content package for this TAM Festival performance.',
    '',
    `Artist: ${artist.name}`,
    artist.genres?.length ? `Genres: ${artist.genres.join(', ')}` : '',
    artist.appearances ? `Nights played at TAM: ${artist.appearances} (${artist.first} to ${artist.last})` : '',
    artist.bio?.length ? `Existing bio: ${[].concat(artist.bio).join(' ')}` : '',
    event ? `Event: ${event.title} on ${event.start.slice(0, 10)}${event.venueLabel ? ` at ${event.venueLabel}` : ''}` : '',
    pageUrl ? `Artist page: ${pageUrl}` : '',
    '',
    'Producer notes from the night:',
    notes || '(none)',
    '',
    'Deliver: a headline; a 120–180 word artist profile; an SEO title (max 60 chars) and meta description (max 155 chars); one caption each for Instagram, TikTok, YouTube and X sized for that platform; 5 short clip ideas (moment + why it works as a clip); 6 interview questions; 3 story angles for TAM.TV.',
  ].filter((l) => l !== '').join('\n');
}

export async function productionPackage(input) {
  if (!aiEnabled()) {
    const err = new Error('AI is not configured. Set ANTHROPIC_API_KEY to enable the Production Agent.');
    err.status = 503;
    err.expose = true;
    throw err;
  }
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: PACKAGE_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(input) }],
  });
  if (response.stop_reason === 'refusal') {
    const err = new Error('The model declined this request. Try rephrasing the notes.');
    err.status = 422;
    err.expose = true;
    throw err;
  }
  if (response.stop_reason === 'max_tokens') {
    const err = new Error('The response was cut off. Try shorter notes.');
    err.status = 502;
    err.expose = true;
    throw err;
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}
