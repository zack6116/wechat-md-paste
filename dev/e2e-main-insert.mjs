import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildArticle, prepareImport } from '../src/lib/article.js';
import { describeBundle, folderFromEntries } from '../src/lib/bundle.js';
import { EDITOR_SOURCE } from '../src/lib/channel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const materialsRoot =
  process.argv[2] || '/Users/zack/Downloads/wechat-materials-20261013';
const fixture = await fs.readFile(path.join(__dirname, 'fixtures/wechat-editor-mock.html'), 'utf8');
const mainJs = await fs.readFile(path.join(__dirname, '../src/page/main.js'), 'utf8');

const pro = { imageLimit: Infinity, allowLocalFolder: true, showFooter: false };
const diskEntries = await walk(materialsRoot);
const described = describeBundle(diskEntries.map((e) => ({ name: e.name, relativePath: e.relativePath })));
const markdown = diskEntries.find((e) => e.relativePath === described.markdownPath);
const text = new TextDecoder().decode(markdown.bytes);
const prepared = prepareImport(text, pro);
const article = buildArticle(
  prepared,
  Object.fromEntries(
    prepared.accepted.map((item) => [item.id, { url: `https://mmbiz.qpic.cn/mock/${item.id}.jpg` }]),
  ),
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.route('http://127.0.0.1:8767/mock', async (route) => {
  await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture });
});
await page.goto('http://127.0.0.1:8767/mock', { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: mainJs });
const result = await page.evaluate(
  async ({ source, html }) => {
    const id = 'e2e-insert-test';
    return new Promise((resolve) => {
      function onMessage(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== source || data.direction !== 'response' || data.id !== id) return;
        window.removeEventListener('message', onMessage);
        resolve(data);
      }
      window.addEventListener('message', onMessage);
      window.postMessage(
        { source, direction: 'request', id, type: 'insert-html', payload: { html } },
        location.origin,
      );
      setTimeout(() => resolve({ ok: false, error: 'timeout' }), 10000);
    });
  },
  { source: EDITOR_SOURCE, html: article.html },
);

const bodyText = await page.locator('#body-editor').innerText();
await browser.close();

console.log(
  JSON.stringify(
    {
      insertOk: result.ok,
      via: result.payload?.via,
      error: result.error,
      bodyPreview: bodyText.slice(0, 120),
      bodyLength: bodyText.length,
    },
    null,
    2,
  ),
);

if (!result.ok || bodyText.length < 80) process.exit(1);

async function walk(dir, prefix = '') {
  const entries = [];
  for (const name of await fs.readdir(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const stat = await fs.stat(full);
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (stat.isDirectory()) entries.push(...(await walk(full, relativePath)));
    else entries.push({ name, relativePath, bytes: new Uint8Array(await fs.readFile(full)) });
  }
  return entries;
}
