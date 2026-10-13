import { folderFromEntries } from '../src/lib/bundle.js';
import { mountPanel } from '../src/panel/panel.js';

const host = document.querySelector('#panel-root');
const status = document.querySelector('#status');
let remoteAllowed = false;

const trial = {
  plan: 'trial',
  imageLimit: Infinity,
  allowLocalFolder: true,
  showFooter: false,
  daysLeft: 14,
  trialEndsAt: Date.now() + 14 * 86400000,
};

const folder = {
  async listRelativePaths() {
    return ['images/demo.png'];
  },
  async readFile() {
    const response = await fetch('/examples/images/demo.png');
    return { name: 'demo.png', bytes: new Uint8Array(await response.arrayBuffer()) };
  },
};

const panel = mountPanel(host, {
  loadEntitlement: async () => trial,
  hasOrigins: async () => remoteAllowed,
  requestOrigins: async () => {
    remoteAllowed = true;
    return true;
  },
  getGrantedFolder: async () => folder,
  hasRememberedFolder: async () => false,
  pickFolder: async () => folder,
  regrantFolder: async () => folder,
  fetchRemote: async () => folder.readFile(),
  uploadImage: async () => `${location.origin}/examples/images/demo.png`,
  async insertArticle(article) {
    if (article.title) document.querySelector('#title').textContent = article.title;
    document.querySelector('#cover').textContent = article.coverUrl ? `封面候选：${article.coverUrl}` : '';
    document.querySelector('#body').innerHTML = article.html;
    return {
      ok: true,
      title: article.title ? 'updated' : 'skipped',
      cover: article.coverUrl ? 'updated' : 'skipped',
    };
  },
  resize(mode) {
    const expanded = mode === 'expanded';
    host.style.width = expanded ? '380px' : '208px';
    host.style.height = expanded ? 'min(640px, calc(100vh - 104px))' : '56px';
  },
  openOptions() {
    status.textContent = '设置页只在扩展里打开。';
  },
});

document.querySelector('#sample').addEventListener('click', async () => {
  const text = await fetch('/examples/sample.md').then((response) => response.text());
  const image = await fetch('/examples/images/demo.png');
  const folder = image.ok
    ? folderFromEntries(
        [{ relativePath: 'images/demo.png', name: 'demo.png', bytes: new Uint8Array(await image.arrayBuffer()) }],
        { base: '' },
      )
    : null;
  status.textContent = '正在导入示例';
  await panel.importText({ text, folder });
});

document.querySelector('#remote').addEventListener('click', () => {
  remoteAllowed = false;
  status.textContent = '如果出现权限按钮，点允许下载';
  panel.importText('远程图片会先下载再上传。\n\n![配图](https://cdn.example.com/demo.png)\n');
});
