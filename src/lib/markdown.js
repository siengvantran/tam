// A small, safe Markdown for newsletters: everything is escaped first, then
// headings, **bold**, *italic*, [links](https://…), ![images](https://…),
// lists, > quotes, --- rules and paragraphs. No raw HTML gets through.

import { escape } from '../views/html.js';

const safeUrl = (u) => (/^(https?:\/\/|\/|mailto:)/i.test(u) ? u : '');

function inline(s, link) {
  return escape(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => (safeUrl(u) ? `<img src="${u}" alt="${alt}" style="max-width:100%;height:auto;border-radius:12px">` : alt))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, u) => (safeUrl(u) ? `<a href="${link(u)}" style="color:#ff5c8a">${label}</a>` : label))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

// `link(url)` lets the sender rewrite links (click tracking); `blocks` are
// ready-made HTML for {{tokens}} that stand on a line of their own.
export function markdown(src, { link = (u) => u, blocks = {} } = {}) {
  const out = [];
  let para = [], list = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '), link)}</p>`);
    para = [];
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i, link)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (const line of String(src || '').replace(/\r/g, '').split('\n')) {
    const t = line.trim();
    const block = /^\{\{\s*(\w+)\s*\}\}$/.exec(t);
    if (block && blocks[block[1]] !== undefined) { flush(); out.push(blocks[block[1]]); continue; }
    if (!t) { flush(); continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(t))) { flush(); out.push(`<h${m[1].length + 1}>${inline(m[2], link)}</h${m[1].length + 1}>`); continue; }
    if (/^(-{3,}|\*{3,})$/.test(t)) { flush(); out.push('<hr>'); continue; }
    if ((m = /^>\s?(.*)$/.exec(t))) { flush(); out.push(`<blockquote>${inline(m[1], link)}</blockquote>`); continue; }
    if ((m = /^([-*]|\d+\.)\s+(.*)$/.exec(t))) {
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (para.length) { const p = para; para = []; out.push(`<p>${inline(p.join(' '), link)}</p>`); }
      if (!list || list.tag !== tag) { if (list) flush(); list = { tag, items: [] }; }
      list.items.push(m[2]);
      continue;
    }
    if (list) flush();
    para.push(t);
  }
  flush();
  return out.join('\n');
}

// Plain text for the text/plain part: links as "label (url)".
export function plain(src) {
  return String(src || '').replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)').replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/^#{1,3}\s+/gm, '');
}
