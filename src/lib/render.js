import { FREE_FOOTER_TEXT } from './constants.js';

const S = {
  root: 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;font-size:16px;line-height:1.75;color:#333333;',
  h1: 'font-size:22px;line-height:1.4;font-weight:700;color:#222222;margin:8px 0 16px;',
  h2: 'font-size:18px;line-height:1.4;font-weight:700;color:#222222;margin:22px 0 10px;padding-left:10px;border-left:3px solid #07c160;',
  h3: 'font-size:16px;line-height:1.5;font-weight:700;color:#222222;margin:18px 0 8px;',
  p: 'margin:0 0 12px;font-size:16px;line-height:1.75;color:#333333;',
  quote: 'margin:12px 0;padding:8px 12px;background:#f7f8fa;border-left:3px solid #07c160;color:#555555;',
  li: 'margin:4px 0;line-height:1.75;',
  list: 'margin:8px 0 12px;padding-left:1.4em;',
  link: 'color:#576b95;text-decoration:none;',
  code: 'font-family:Menlo,Consolas,"Courier New",monospace;font-size:14px;background:#f4f4f4;padding:1px 4px;border-radius:3px;color:#c7254e;',
  pre: 'margin:12px 0;padding:12px 14px;background:#f7f7f7;border-radius:6px;font-family:Menlo,Consolas,"Courier New",monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:#333333;',
  img: 'max-width:100%;height:auto;display:block;margin:12px auto;',
  hr: 'border:none;border-top:1px solid #eeeeee;margin:20px 0;',
  note: 'margin:8px 0 12px;font-size:13px;line-height:1.6;color:#9a9a9a;',
  footer: 'margin-top:28px;font-size:12px;line-height:1.6;color:#b2b2b2;text-align:center;',
  table: 'width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;line-height:1.6;',
};

export function renderDocument(doc, results, { showFooter = false } = {}) {
  const ctx = { results: results || {} };
  const body = doc.blocks.map((block) => renderBlock(block, ctx)).join('');
  const footer = showFooter ? `<p style="${S.footer}">${escapeHtml(FREE_FOOTER_TEXT)}</p>` : '';
  return `<section style="${S.root}">${body}${footer}</section>`;
}

export function pickCoverUrl(items, results, coverSrc) {
  if (coverSrc) {
    const named = items.find((item) => item.role === 'cover' || item.src === coverSrc);
    const namedUrl = named && results[named.id]?.url;
    if (namedUrl) return namedUrl;
  }
  for (const item of items) {
    if (item.role === 'body' && results[item.id]?.url) return results[item.id].url;
  }
  return '';
}

function renderBlock(block, ctx) {
  if (block.type === 'heading') {
    const level = Math.min(block.level, 3);
    const style = level === 1 ? S.h1 : level === 2 ? S.h2 : S.h3;
    return `<h${level} style="${style}">${renderInline(block.children, ctx)}</h${level}>`;
  }
  if (block.type === 'paragraph') return `<p style="${S.p}">${renderInline(block.children, ctx)}</p>`;
  if (block.type === 'quote') {
    return `<blockquote style="${S.quote}">${block.blocks.map((child) => renderBlock(child, ctx)).join('')}</blockquote>`;
  }
  if (block.type === 'ul' || block.type === 'ol') return renderList(block, ctx);
  if (block.type === 'code') return `<pre style="${S.pre}"><code>${escapeHtml(block.text)}</code></pre>`;
  if (block.type === 'hr') return `<hr style="${S.hr}">`;
  if (block.type === 'table') return renderTable(block, ctx);
  return '';
}

function renderTable(block, ctx) {
  const head = block.header
    .map((cell, index) => `<th style="${cellStyle(block.align[index], true)}">${renderInline(cell, ctx)}</th>`)
    .join('');
  const body = block.rows
    .map((row) => {
      const cells = row
        .map((cell, index) => `<td style="${cellStyle(block.align[index], false)}">${renderInline(cell, ctx)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table style="${S.table}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function cellStyle(align, header) {
  const background = header ? 'background:#f7f8fa;font-weight:700;color:#222222;' : '';
  return `border:1px solid #e5e5e5;padding:8px 10px;text-align:${align || 'left'};vertical-align:top;${background}`;
}

function renderList(block, ctx) {
  const items = block.items
    .map((item) => {
      const nested = (item.blocks || []).map((child) => renderBlock(child, ctx)).join('');
      return `<li style="${S.li}">${renderInline(item.children, ctx)}${nested}</li>`;
    })
    .join('');
  return `<${block.type} style="${S.list}">${items}</${block.type}>`;
}

function renderInline(nodes, ctx) {
  return (nodes || [])
    .map((node) => {
      if (typeof node === 'string') return escapeHtml(node);
      if (node.type === 'br') return '<br>';
      if (node.type === 'strong') return `<strong>${renderInline(node.children, ctx)}</strong>`;
      if (node.type === 'em') return `<em>${renderInline(node.children, ctx)}</em>`;
      if (node.type === 'code') return `<code style="${S.code}">${escapeHtml(node.text)}</code>`;
      if (node.type === 'link') {
        const href = safeHttpUrl(node.href);
        const label = renderInline(node.children, ctx);
        if (!href) return label;
        return `<a href="${escapeAttr(href)}" style="${S.link}">${label}</a>`;
      }
      if (node.type === 'image') return renderImage(node, ctx);
      return '';
    })
    .join('');
}

function renderImage(node, ctx) {
  const found = ctx.results[node.id];
  const url = found?.url ? safeHttpUrl(found.url) : '';
  if (!url) {
    const reason = found?.error || '图片未导入';
    return `<span style="${S.note}">（${escapeHtml(reason)}）</span>`;
  }
  return `<img src="${escapeAttr(url)}" alt="${escapeAttr(node.alt || '')}" style="${S.img}">`;
}

function safeHttpUrl(value) {
  const text = String(value || '').trim();
  if (!/^https?:\/\//i.test(text)) return '';
  if (/[\u0000-\u001f\s]/.test(text)) return '';
  return text;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
