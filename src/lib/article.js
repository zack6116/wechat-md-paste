import { parseMarkdown } from './markdown.js';
import { selectImages } from './images.js';
import { pickCoverUrl, renderDocument } from './render.js';

export function prepareImport(markdown, entitlement) {
  const doc = parseMarkdown(markdown);
  const bodyImages = [];
  assignImageIds(doc.blocks, bodyImages);
  const selected = selectImages({
    bodyImages,
    coverSrc: doc.frontmatter.cover,
    entitlement,
  });
  return { doc, showFooter: !!entitlement.showFooter, ...selected };
}

export function buildArticle(prepared, results) {
  const html = renderDocument(prepared.doc, results, { showFooter: prepared.showFooter });
  return {
    html,
    title: prepared.doc.frontmatter.title,
    coverUrl: pickCoverUrl(
      [...prepared.accepted, ...prepared.skipped],
      results,
      prepared.doc.frontmatter.cover,
    ),
  };
}

function assignImageIds(blocks, images) {
  for (const block of blocks || []) {
    if (block.type === 'quote') assignImageIds(block.blocks, images);
    if (block.type === 'ul' || block.type === 'ol') {
      for (const item of block.items) {
        walkInline(item.children, images);
        assignImageIds(item.blocks, images);
      }
    }
    if (block.type === 'table') {
      for (const cell of block.header) walkInline(cell, images);
      for (const row of block.rows) {
        for (const cell of row) walkInline(cell, images);
      }
    }
    if (block.children) walkInline(block.children, images);
  }
}

function walkInline(nodes, images) {
  for (const node of nodes || []) {
    if (!node || typeof node === 'string') continue;
    if (node.type === 'image') {
      node.id = `img-${images.length + 1}`;
      images.push({ id: node.id, role: 'body', src: node.src, alt: node.alt || '' });
    }
    if (node.children) walkInline(node.children, images);
  }
}
