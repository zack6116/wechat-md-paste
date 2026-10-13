import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(__dirname, '..');
const imagePost = process.argv.includes('--image-post');
const materialsRoot =
  process.argv.slice(2).find((arg) => arg !== '--image-post' && !arg.startsWith('-')) ||
  '/Users/zack/Downloads/wechat-materials-20261013';
const fixtureName = imagePost ? 'wechat-editor-image-post-mock.html' : 'wechat-editor-mock.html';
const fixture = await fs.readFile(path.join(__dirname, 'fixtures', fixtureName), 'utf8');
const editUrl = imagePost
  ? 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=8&token=mock'
  : 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&token=mock';

const userDataDir = path.join(__dirname, '.e2e-chrome-profile');
const context = await chromium.launchPersistentContext(userDataDir, {
  // MV3 extensions do not load in classic headless Chromium.
  headless: false,
  args: [
    `--disable-extensions-except=${extensionRoot}`,
    `--load-extension=${extensionRoot}`,
  ],
});

const page = await context.newPage();
await page.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith('https://mp.weixin.qq.com/')) {
    if (route.request().resourceType() === 'document') {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture });
      return;
    }
    if (url.includes('/cgi-bin/filetransfer')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ base_resp: { ret: 0 }, cdn_url: 'https://mmbiz.qpic.cn/mock/uploaded.jpg' }),
      });
      return;
    }
  }
  await route.continue();
});

await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const panel = page.frameLocator('#wmp-panel');
await panel.locator('button.pill, .drop').first().waitFor({ timeout: 15000 });
await panel.locator('button.pill').click({ timeout: 5000 }).catch(() => {});
await panel.locator('.drop').click({ timeout: 5000 }).catch(() => {});

const dirInput = panel.locator('input.dir');
await dirInput.setInputFiles(materialsRoot);

await panel.locator('.log li').first().waitFor({ timeout: 20000 });
await page.waitForTimeout(8000);

const logText = await panel.locator('.log').innerText();
const bodyLocator = imagePost ? page.locator('#desc-editor') : page.locator('#body-editor');
const bodyHtml = await bodyLocator.innerHTML();
const bodyText = await bodyLocator.innerText();
const blockedImagePost = imagePost && /不支持贴图|只支持「文章」/i.test(logText);
const hasError =
  blockedImagePost ||
  /找不到正文编辑区|编辑器没有响应|导入失败|启动失败|不支持贴图|只支持「文章」/i.test(logText);
const inserted = imagePost
  ? blockedImagePost
  : bodyText.length > 40 &&
    !/从这里开始写正文/.test(bodyText) &&
    /AI时代|程序员/.test(bodyText);

let storedLog = '';
let serviceWorker = context.serviceWorkers()[0];
if (!serviceWorker) {
  serviceWorker = await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null);
}
if (serviceWorker) {
  storedLog = await serviceWorker.evaluate(async () => {
    const data = await chrome.storage.local.get('lastImportLog');
    return data.lastImportLog || '';
  });
}

const logSaved = imagePost
  ? /不支持贴图|只支持「文章」/.test(storedLog)
  : /已插入正文/.test(storedLog) && !/找不到正文编辑区|编辑器没有响应/.test(storedLog);

console.log(
  JSON.stringify(
    {
      scenario: imagePost ? 'image-post-createType-8' : 'article',
      logPreview: logText.split('\n').slice(0, 12),
      bodyLength: bodyHtml.length,
      inserted,
      hasError,
      logSaved,
      storedLogPreview: storedLog.split('\n').slice(-4),
    },
    null,
    2,
  ),
);

await context.close();
if (imagePost) {
  if (!blockedImagePost || !logSaved) process.exit(1);
} else if (hasError || !inserted || !logSaved) process.exit(1);
