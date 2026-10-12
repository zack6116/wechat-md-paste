import { TITLE_MAX } from './constants.js';

export function parseMarkdown(source) {
  const cleaned = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const { data, body } = parseFrontmatter(cleaned);
  return {
    frontmatter: {
      title: cleanMeta(data.title).slice(0, TITLE_MAX),
      cover: cleanMeta(data.cover),
    },
    blocks: parseBlocks(body.split('\n')),
  };
}

export function looksLikeMarkdown(text) {
  const source = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (source.length < 2) return false;
  if (/^---\n[\s\S]*?\n---(\n|$)/.test(source)) return true;
  if (/^```/m.test(source)) return true;
  if (/^#{1,6} \S/m.test(source)) return true;
  if (/!\[[^\]]*\]\([^)]+\)/.test(source)) return true;
  const signals = [
    /^>\s+\S/m.test(source),
    /^(\s*[-*+]|\s*\d+\.)\s+\S/m.test(source),
    /\*\*[^*\n]+\*\*/.test(source),
    /__[^_\n]+__/.test(source),
    /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(source),
  ].filter(Boolean).length;
  return signals >= 2 || (signals >= 1 && source.includes('\n') && source.length > 40);
}

export function inlineToText(nodes) {
  return (nodes || [])
    .map((node) => {
      if (typeof node === 'string') return node;
      if (node.type === 'br') return ' ';
      if (node.type === 'code') return node.text;
      if (node.type === 'image') return node.alt || '';
      if (node.children) return inlineToText(node.children);
      return '';
    })
    .join('');
}

function parseFrontmatter(text) {
  const matched = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!matched) return { data: {}, body: text };
  const data = {};
  for (const line of matched[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    data[kv[1]] = unquote(kv[2].trim());
  }
  return { data, body: text.slice(matched[0].length) };
}

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'code', lang, text: buf.join('\n') });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(\S.*)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        children: parseInline(heading[2].trim()),
      });
      i += 1;
      continue;
    }
    if (isTableStart(lines, i)) {
      const parsed = parseTable(lines, i);
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const inner = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        inner.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(inner) });
      continue;
    }
    if (isListLine(line)) {
      const parsed = parseList(lines, i);
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !isSpecialLine(lines, i)) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseParagraph(para.join('\n')) });
  }
  return blocks;
}

function parseList(lines, start) {
  const baseIndent = leadingIndent(lines[start]);
  const ordered = /^\s*\d+\.\s+/.test(lines[start]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) break;
    if (!isListLine(line)) break;
    const indent = leadingIndent(line);
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      if (!items.length) break;
      const nested = parseList(lines, i);
      if (nested.next === i) break;
      items[items.length - 1].blocks.push(nested.block);
      i = nested.next;
      continue;
    }
    const marker = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (!marker) break;
    const itemOrdered = /^\d+\.$/.test(marker[2]);
    if (itemOrdered !== ordered) break;
    items.push({ children: parseInline(marker[3]), blocks: [] });
    i += 1;
  }
  return { block: { type: ordered ? 'ol' : 'ul', items }, next: i };
}

function parseParagraph(text) {
  const lines = text.split('\n');
  const nodes = [];
  lines.forEach((line, index) => {
    if (index) nodes.push({ type: 'br' });
    nodes.push(...parseInline(line));
  });
  return nodes;
}

function parseInline(text) {
  const nodes = [];
  let buf = '';
  const flush = () => {
    if (buf) nodes.push(buf);
    buf = '';
  };
  for (let i = 0; i < text.length; ) {
    if (text[i] === '\\' && i + 1 < text.length) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith('![', i)) {
      const image = readLinkLike(text, i + 1);
      if (image) {
        flush();
        nodes.push({ type: 'image', alt: image.label, src: image.href });
        i = image.next;
        continue;
      }
    }
    if (text[i] === '[') {
      const link = readLinkLike(text, i);
      if (link && (/^https?:\/\//i.test(link.href) || /^mailto:/i.test(link.href))) {
        flush();
        nodes.push({ type: 'link', href: link.href, children: parseInline(link.label) });
        i = link.next;
        continue;
      }
    }
    if (text.startsWith('**', i) || text.startsWith('__', i)) {
      const marker = text.slice(i, i + 2);
      const end = text.indexOf(marker, i + 2);
      if (end > i + 2) {
        flush();
        nodes.push({ type: 'strong', children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((text[i] === '*' || text[i] === '_') && text[i + 1] !== text[i]) {
      const marker = text[i];
      const end = text.indexOf(marker, i + 1);
      const prev = i > 0 ? text[i - 1] : '';
      const next = end >= 0 ? text[end + 1] || '' : '';
      if (
        end > i + 1 &&
        !/\s/.test(text[i + 1]) &&
        !/\s/.test(text[end - 1]) &&
        !/[\w]/.test(prev) &&
        !/[\w]/.test(next)
      ) {
        flush();
        nodes.push({ type: 'em', children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return nodes;
}

function readLinkLike(text, i) {
  const label = readUntil(text, i + 1, ']');
  if (!label || text[label.next] !== '(') return null;
  const dest = readUntil(text, label.next + 1, ')');
  if (!dest) return null;
  const href = dest.content.trim().split(/\s+/)[0].replace(/^<|>$/g, '');
  if (!href) return null;
  return { label: label.content, href, next: dest.next };
}

function readUntil(text, start, close) {
  let i = start;
  let content = '';
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      content += text[i + 1];
      i += 2;
      continue;
    }
    if (text[i] === close) return { content, next: i + 1 };
    content += text[i];
    i += 1;
  }
  return null;
}

function isSpecialLine(lines, index) {
  const line = lines[index];
  return (
    line.startsWith('```') ||
    /^(#{1,6})\s+\S/.test(line) ||
    /^>\s?/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    isListLine(line) ||
    isTableStart(lines, index)
  );
}

function isListLine(line) {
  return /^(\s*)([-*+]|\d+\.)\s+\S/.test(line);
}

function parseTable(lines, start) {
  const header = splitTableRow(lines[start]).map((cell) => parseInline(cell.trim()));
  const align = splitTableRow(lines[start + 1]).map(tableAlign);
  const rows = [];
  let i = start + 2;
  while (i < lines.length && looksLikeTableRow(lines[i])) {
    const cells = splitTableRow(lines[i]).map((cell) => parseInline(cell.trim()));
    while (cells.length < header.length) cells.push([]);
    rows.push(cells.slice(0, header.length));
    i += 1;
  }
  return { block: { type: 'table', align, header, rows }, next: i };
}

function splitTableRow(line) {
  let text = String(line || '').trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  const cells = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\' && text[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (text[i] === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += text[i];
  }
  cells.push(current);
  return cells;
}

function tableAlign(cell) {
  const text = cell.trim();
  if (text.startsWith(':') && text.endsWith(':')) return 'center';
  if (text.endsWith(':')) return 'right';
  return 'left';
}

function looksLikeTableRow(line) {
  const text = String(line || '').trim();
  return text.startsWith('|') && text.endsWith('|') && text.includes('|', 1);
}

function isTableStart(lines, index) {
  if (!looksLikeTableRow(lines[index] || '')) return false;
  const next = lines[index + 1] || '';
  return /^\s*\|?\s*:?-{3,}.*\|?\s*$/.test(next);
}

function leadingIndent(line) {
  const matched = line.match(/^[ \t]*/);
  return matched[0].replace(/\t/g, '  ').length;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function cleanMeta(value) {
  return String(value || '').trim();
}
