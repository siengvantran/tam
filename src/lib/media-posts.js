// An artist's posts on their page: Instagram, TikTok, Facebook and YouTube
// links (shown as embeds), and their own photos and videos (uploaded to
// TAM). Shared by the Sunday Showcase act pages and the TAM Stage.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { escape as e } from '../views/html.js';
import { fail, readRaw } from './http.js';

export const VIDEO_MB = 60; // the most a video upload can be
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

// A post from any link form of the four networks; null if it isn't one.
export function postOf(u) {
  const s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s)) return null;
  const yt = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/.exec(s);
  if (yt && /youtu/.test(s)) return { kind: 'youtube', videoId: yt[1] };
  const ig = /instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]{5,40})/.exec(s);
  if (ig) return { kind: 'instagram', postId: ig[2], postType: ig[1] === 'reel' || ig[1] === 'reels' ? 'reel' : 'p' };
  const tt = /tiktok\.com\/@[\w.-]+\/(?:video|photo)\/(\d{8,25})/.exec(s);
  if (tt) return { kind: 'tiktok', videoId: tt[1] };
  if (/(^https?:\/\/)(vm|vt)\.tiktok\.com\//i.test(s)) throw fail(400, 'Open the TikTok in your browser and copy the full link (tiktok.com/@name/video/…).');
  const fb = /^https?:\/\/(?:www\.|m\.|web\.)?(facebook\.com|fb\.watch)\/([^\s?#]+)/i.exec(s);
  if (fb) {
    const href = `https://${fb[1] === 'fb.watch' ? 'fb.watch' : 'www.facebook.com'}/${fb[2].replace(/\/+$/, '')}${fb[1] === 'facebook.com' && /[?&](v|story_fbid|id)=/.test(s) ? `?${s.split('?')[1].split('#')[0]}` : ''}`;
    const video = fb[1] === 'fb.watch' || /\/(videos|reel|watch)\b/.test(fb[2]) || /[?&]v=/.test(s);
    return { kind: 'facebook', href: href.slice(0, 400), video };
  }
  return null;
}

export const POST_HELP = 'Paste a link to an Instagram post or reel, a TikTok, a Facebook post or video, or a YouTube video.';

// The embed for a post (HTML string, escaped).
export function embedHtml(w) {
  switch (w.kind) {
    case 'youtube': return `<div class="aw-embed aw-yt"><iframe src="https://www.youtube-nocookie.com/embed/${e(w.videoId)}" title="YouTube video" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
    case 'instagram': return `<div class="aw-embed aw-ig"><iframe src="https://www.instagram.com/${e(w.postType || 'p')}/${e(w.postId)}/embed" title="Instagram post" loading="lazy" scrolling="no"></iframe></div>`;
    case 'tiktok': return `<div class="aw-embed aw-tt"><iframe src="https://www.tiktok.com/embed/v2/${e(w.videoId)}" title="TikTok video" loading="lazy" allow="encrypted-media; fullscreen" allowfullscreen></iframe></div>`;
    case 'facebook': return `<div class="aw-embed ${w.video ? 'aw-fbv' : 'aw-fb'}"><iframe src="https://www.facebook.com/plugins/${w.video ? 'video' : 'post'}.php?href=${encodeURIComponent(w.href)}&show_text=${w.video ? 'false' : 'true'}&width=500" title="Facebook ${w.video ? 'video' : 'post'}" loading="lazy" scrolling="no" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
    case 'image': return `<figure class="aw-media"><img src="${e(w.src)}" alt="${e(w.caption || '')}" loading="lazy"></figure>`;
    case 'video': return `<figure class="aw-media"><video src="${e(w.src)}" controls playsinline preload="metadata"></video></figure>`;
    default: return '';
  }
}
export const KIND_NAMES = { youtube: 'YouTube video', instagram: 'Instagram post', tiktok: 'TikTok', facebook: 'Facebook post', image: 'Photo', video: 'Video', note: 'Note' };

// Their own video: the raw file in the request body (no transcoding: MP4 plays everywhere).
export async function saveVideo(ctx, req, name) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = VIDEO_TYPES[type];
  if (!ext) throw fail(400, 'Videos can be MP4, WebM or MOV (iPhone).');
  if (Number(req.headers['content-length'] || 0) > VIDEO_MB * 1024 * 1024) throw fail(413, `Videos can be up to ${VIDEO_MB} MB. Trim it, or post it to Instagram, TikTok or YouTube and paste the link.`);
  const buf = await readRaw(req, VIDEO_MB * 1024 * 1024).catch(() => { throw fail(413, `Videos can be up to ${VIDEO_MB} MB.`); });
  if (buf.length < 1000) throw fail(400, 'That video looks empty.');
  const file = `${name.replace(/[^\w-]/g, '')}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(ctx.uploadsDir, file), buf);
  return `/uploads/${file}`;
}

// Their own photo: a data URL, already shrunk in the browser.
export const saveImage = (ctx, dataUrl, name) => ctx.saveImage(dataUrl, `${name.replace(/[^\w-]/g, '')}-${crypto.randomBytes(6).toString('hex')}`, { what: 'Photos', maxKB: 900 });

// Remove an uploaded file when its post goes.
export async function dropUpload(ctx, src) {
  if (!src || !String(src).startsWith('/uploads/') || !ctx.uploadsDir) return;
  await fs.unlink(path.join(ctx.uploadsDir, path.basename(src))).catch(() => {});
}
