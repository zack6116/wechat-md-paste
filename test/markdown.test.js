import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikeMarkdown, parseMarkdown } from '../src/lib/markdown.js';
import { prepareImport } from '../src/lib/article.js';
import { renderDocument } from '../src/lib/render.js';
import { FREE_FOOTER_TEXT } from '../src/lib/constants.js';

const pro = { imageLimit: Infinity, allowLocalFolder: true, showFooter: false };
const free = { imageLimit: 3, allowLocalFolder: false, showFooter: true };

test('parses frontmatter, headings, inline marks, lists, quote, link, code and image', () => {
  const doc = parseMarkdown(`---
title: "你好，公众号"
cover: ./cover.png
---

# 一级

这是**加粗**、*斜体*和\`code\`。

- 第一项
  - 嵌套
- 第二项

> 引用一句

[官网](https://example.com/docs)

---

\`\`\`js
const a = 1 < 2;
\`\`\`

![配图](./images/a.png)
`);
  assert.equal(doc.frontmatter.title, '你好，公众号');
  assert.equal(doc.frontmatter.cover, './cover.png');
  assert.equal(doc.blocks[0].type, 'heading');
  assert.equal(doc.blocks[0].level, 1);
  const paragraph = doc.blocks[1];
  assert.equal(paragraph.children.some((node) => node.type === 'strong'), true);
  assert.equal(paragraph.children.some((node) => node.type === 'em'), true);
  assert.equal(paragraph.children.some((node) => node.type === 'code'), true);
  assert.equal(doc.blocks[2].type, 'ul');
  assert.equal(doc.blocks[2].items[0].blocks[0].type, 'ul');
  assert.equal(doc.blocks[3].type, 'quote');
  assert.equal(doc.blocks[4].type, 'paragraph');
  assert.equal(doc.blocks[5].type, 'hr');
  assert.equal(doc.blocks[6].type, 'code');
  assert.match(doc.blocks[6].text, /1 < 2/);
  assert.equal(doc.blocks[7].children[0].type, 'image');
});

test('escapes raw html instead of injecting it', () => {
  const doc = parseMarkdown('你好 <script>alert(1)</script>');
  const html = renderDocument(doc, {}, { showFooter: false });
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;script&gt;/);
});

test('renders a markdown table with alignment and inline marks', () => {
  const doc = parseMarkdown('| 名称 | 数量 |\n| :--- | ---: |\n| **苹果** | 1 |\n| 梨 \\| 青 | 2 |');
  const html = renderDocument(doc, {}, {});
  assert.equal(html.includes('表格转图片尚未提供'), false);
  assert.match(html, /<table /);
  assert.match(html, /<th[^>]*>名称<\/th>/);
  assert.match(html, /text-align:right/);
  assert.match(html, /<strong>苹果<\/strong>/);
  assert.match(html, /梨 \| 青/);
  assert.equal(html.match(/<td /g).length, 4);
});

test('detects pasted markdown and ignores plain sentences', () => {
  assert.equal(looksLikeMarkdown('今天开会，记得带笔记本。'), false);
  assert.equal(looksLikeMarkdown('## 标题\n\n- 一点\n- 两点'), true);
});

test('free plan keeps three images, skips local files, and adds the footer', () => {
  const prepared = prepareImport(`![一](https://cdn.example.com/1.png)
![二](./local.png)
![三](https://mmbiz.qpic.cn/a.jpg)
![四](https://cdn.example.com/4.png)
![五](https://cdn.example.com/5.png)`, free);
  assert.equal(prepared.accepted.length, 3);
  assert.equal(prepared.accepted.some((item) => item.kind === 'local'), false);
  assert.equal(prepared.showFooter, true);
  const results = {};
  for (const item of prepared.skipped) results[item.id] = { error: item.reason };
  for (const item of prepared.accepted) results[item.id] = { url: `https://mmbiz.qpic.cn/${item.id}.jpg` };
  const html = renderDocument(prepared.doc, results, { showFooter: true });
  assert.equal(html.match(/<img /g).length, 3);
  assert.match(html, new RegExp(FREE_FOOTER_TEXT));
  assert.match(html, /免费版不支持本地图片/);
});

test('pro plan accepts a local image and a separate cover', () => {
  const prepared = prepareImport('---\ncover: ./cover.png\n---\n\n![图](https://cdn.example.com/a.png)', pro);
  assert.equal(prepared.needsFolder, true);
  assert.deepEqual(prepared.remoteOrigins, ['https://cdn.example.com/*']);
  assert.equal(prepared.accepted.some((item) => item.id === 'cover' && item.kind === 'local'), true);
  assert.equal(prepared.showFooter, false);
});
