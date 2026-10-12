import { buildArticle, prepareImport } from '../lib/article.js';
import { base64ToBytes, bytesToBase64 } from '../lib/bytes.js';
import { formatPlan, resolveEntitlement } from '../lib/entitlement.js';
import { indexRelativePaths, matchLocalPath } from '../lib/images.js';
import { verifyLicenseKey } from '../lib/license.js';
import { localLookupError, resolveImages } from '../lib/resolve-images.js';
import { deleteDirectoryHandle, loadDirectoryHandle } from './folder-store.js';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

export function mountPanel(root, deps) {
  const state = {
    open: false,
    planText: '正在读取授权…',
    lines: [],
    phase: 'idle',
    prompt: '',
    folderPrompt: false,
  };
  let job = null;
  let running = false;

  root.innerHTML = `
    <div class="shell collapsed">
      <button class="pill" type="button">导入 Markdown</button>
      <section class="card">
        <header>
          <div>
            <h1>公众号 MD Paste</h1>
            <div class="plan"></div>
          </div>
          <button class="ghost" type="button" data-action="collapse">收起</button>
        </header>
        <aside class="practice">
          <strong>最佳实践</strong>
          <p>让模型使用 skill <code>wechat-mp-markdown</code> 生成稿子。支持图片自动上传：写成 <code>![说明](images/01.png)</code>，或使用公网 https 图片地址，导入时会传到当前公众号。本地图片第一次选择所在文件夹。<a href="https://wechat-markdown.coderfather.com/#skill" target="_blank" rel="noreferrer">下载 skill</a></p>
        </aside>
        <p class="lead">把 .md 拖进这个面板或编辑页，也可以在正文里 Ctrl+V。内容插到当前光标，不会自动发布。</p>
        <label class="drop">选择 Markdown 文件<input class="file" type="file" accept=".md,.markdown,text/markdown,text/plain" hidden></label>
        <div class="actions"></div>
        <ol class="log"></ol>
        <footer>
          <button class="linkish" type="button" data-action="options">设置与激活</button>
          <span>适配 2026-10-12</span>
        </footer>
      </section>
    </div>`;

  const shell = root.querySelector('.shell');
  const plan = root.querySelector('.plan');
  const actions = root.querySelector('.actions');
  const log = root.querySelector('.log');
  const fileInput = root.querySelector('.file');

  root.querySelector('.pill').addEventListener('click', () => setOpen(true));
  root.querySelector('[data-action="collapse"]').addEventListener('click', () => setOpen(false));
  root.querySelector('[data-action="options"]').addEventListener('click', () => deps.openOptions());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) file.text().then((text) => guarded(() => begin(text)));
  });
  root.querySelector('.card').addEventListener('dragover', (event) => event.preventDefault());
  root.querySelector('.card').addEventListener('drop', (event) => {
    event.preventDefault();
    const file = [...(event.dataTransfer?.files || [])].find((item) => /\.(md|markdown)$/i.test(item.name));
    if (!file) {
      push('请拖入 .md 文件', 'error');
      return;
    }
    file.text().then((text) => guarded(() => begin(text)));
  });

  deps.onImportText?.((message) => {
    setOpen(true);
    if (message.notice) push(message.notice, 'warn');
    guarded(() => begin(message.text));
  });
  refreshPlan();
  render();

  return {
    importText: (text) => guarded(() => begin(text)),
  };

  function setOpen(open) {
    state.open = open;
    deps.resize(open ? 'expanded' : 'collapsed');
    render();
  }

  async function refreshPlan() {
    try {
      state.planText = formatPlan(await deps.loadEntitlement());
    } catch {
      state.planText = '授权状态暂时读不到';
    }
    render();
  }

  async function begin(text) {
    if (running) {
      push('正在导入上一篇，请稍候', 'warn');
      return;
    }
    running = true;
    setOpen(true);
    state.lines = [];
    state.phase = 'running';
    state.prompt = '';
    render();
    const entitlement = await deps.loadEntitlement();
    state.planText = formatPlan(entitlement);
    const prepared = prepareImport(text, entitlement);
    if (!prepared.doc.blocks.length && !prepared.doc.frontmatter.title) {
      throw new Error('这份 Markdown 没有可导入的正文');
    }
    job = { prepared };
    const skipped = prepared.skipped.length ? `，另有 ${prepared.skipped.length} 张不会导入` : '';
    push(`已解析，准备处理 ${prepared.accepted.length} 张图片${skipped}`);
    await continueJob();
  }

  async function continueJob() {
    const { prepared } = job;
    if (prepared.remoteOrigins.length && !(await deps.hasOrigins(prepared.remoteOrigins))) {
      state.phase = 'need-remote';
      state.prompt = '网络图片需要临时允许扩展访问图片所在网站。字节只在你的浏览器里中转，不会发到扩展作者的服务器。';
      running = false;
      render();
      return;
    }
    if (prepared.needsFolder && !job.folder) {
      const folder = await deps.getGrantedFolder();
      if (folder) {
        job.folder = folder;
      } else {
        state.phase = 'need-folder';
        state.folderPrompt = await deps.hasRememberedFolder();
        state.prompt = state.folderPrompt
          ? '需要再确认一次文件夹权限。接下来会打开扩展自己的小窗口。'
          : '文中有本地图片。接下来会打开扩展自己的小窗口，请在那里选择图片所在的文件夹。';
        running = false;
        render();
        return;
      }
    }
    await finishJob();
  }

  async function finishJob() {
    state.phase = 'running';
    running = true;
    render();
    const prepared = job.prepared;
    const pathIndex = job.folder ? indexRelativePaths(await job.folder.listRelativePaths()) : null;
    const resolved = await resolveImages(prepared.accepted, {
      readLocal: async (src) => {
        if (!pathIndex || !job.folder) throw new Error('还没有授权图片文件夹');
        const error = localLookupError(src, pathIndex);
        if (error) throw new Error(error);
        return job.folder.readFile(matchLocalPath(src, pathIndex).path);
      },
      fetchRemote: deps.fetchRemote,
      upload: deps.uploadImage,
      onProgress: ({ index, total }) => setProgress(`正在处理图片 ${index + 1}/${total}`),
    });
    const results = {};
    for (const item of prepared.skipped) {
      if (item.role === 'body') results[item.id] = { error: item.reason };
    }
    Object.assign(results, resolved.results);
    for (const warning of resolved.warnings) push(warning, 'warn');
    for (const item of prepared.skipped) {
      if (item.reason) push(item.reason, 'warn');
    }
    for (const result of Object.values(resolved.results)) {
      if (result.error) push(result.error, 'warn');
    }
    const failed =
      prepared.skipped.length + Object.values(resolved.results).filter((item) => item.error).length;
    push('正在写入编辑器');
    const inserted = await deps.insertArticle(buildArticle(prepared, results));
    if (!inserted?.ok) throw new Error(inserted?.error || '写入编辑器失败');
    state.phase = 'done';
    push(successText(inserted, failed), 'ok');
    running = false;
    render();
  }

  async function guarded(task) {
    try {
      await task();
    } catch (error) {
      state.phase = 'error';
      push(error instanceof Error ? error.message : '导入失败', 'error');
      running = false;
      render();
    }
  }

  function dropRemoteImages() {
    const removed = job.prepared.accepted.filter((item) => item.kind === 'remote');
    job.prepared.accepted = job.prepared.accepted.filter((item) => item.kind !== 'remote');
    job.prepared.remoteOrigins = [];
    job.prepared.skipped.push(...removed.map((item) => ({ ...item, reason: '未允许下载网络图片' })));
    push('已跳过网络图片', 'warn');
  }

  function skipRemote() {
    guarded(async () => {
      dropRemoteImages();
      running = true;
      await continueJob();
    });
  }

  function render() {
    shell.classList.toggle('collapsed', !state.open);
    plan.textContent = state.planText;
    log.replaceChildren(
      ...state.lines.map((line) => {
        const item = document.createElement('li');
        item.className = line.kind || '';
        item.textContent = line.text;
        return item;
      }),
    );
    actions.replaceChildren();
    if (state.phase === 'need-remote') actions.append(note(state.prompt), actionButton('允许下载网络图片', allowRemote), actionButton('跳过网络图片', skipRemote, 'secondary'));
    if (state.phase === 'need-folder') {
      actions.append(
        note(state.prompt),
        actionButton(state.folderPrompt ? '允许读取图片文件夹' : '选择图片文件夹', state.folderPrompt ? allowFolder : pickFolder),
      );
    }
  }

  function allowRemote() {
    guarded(async () => {
      const granted = await deps.requestOrigins(job.prepared.remoteOrigins);
      if (!granted) dropRemoteImages();
      running = true;
      await continueJob();
    });
  }

  function pickFolder() {
    guarded(async () => {
      const folder = await deps.pickFolder();
      if (!folder) return;
      job.folder = folder;
      running = true;
      await continueJob();
    });
  }

  function allowFolder() {
    guarded(async () => {
      const folder = await deps.regrantFolder();
      if (!folder) throw new Error('没有获得文件夹读取权限');
      job.folder = folder;
      running = true;
      await continueJob();
    });
  }

  function setProgress(text) {
    const last = state.lines[state.lines.length - 1];
    if (last?.kind === 'progress') last.text = text;
    else state.lines.push({ kind: 'progress', text });
    render();
  }

  function push(text, kind = 'info') {
    state.lines.push({ kind, text });
    render();
  }
}

function successText(inserted, failed) {
  const bits = ['已插入正文。请检查后再手动发布，扩展不会替你点发布。'];
  if (inserted.title === 'updated') bits.push('已填入 frontmatter 标题。');
  if (inserted.title === 'exists') bits.push('标题原本有内容，没有覆盖。');
  if (inserted.title === 'missing') bits.push('没有找到标题输入框，标题需要你自己贴。');
  if (inserted.cover === 'updated') bits.push('已把图片设为封面。');
  if (inserted.cover === 'exists') bits.push('封面原本已有，没有覆盖。');
  if (inserted.cover === 'no-api') bits.push('这版编辑器没有封面接口，请手动从正文选择封面。');
  if (failed) bits.push(`有 ${failed} 张图片没有导入。`);
  return bits.join('');
}

function note(text) {
  const paragraph = document.createElement('p');
  paragraph.className = 'prompt';
  paragraph.textContent = text;
  return paragraph;
}

function actionButton(label, onClick, kind = 'primary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = kind;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

async function walkDirectory(dir, prefix, depth, map) {
  if (depth > 6 || map.size > 800) return;
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'file') {
      if (IMAGE_EXT.test(name)) map.set(rel, handle);
    } else if (handle.kind === 'directory') {
      await walkDirectory(handle, rel, depth + 1, map);
    }
  }
}

function bindFolder(handle) {
  let cache;
  async function files() {
    if (!cache) {
      cache = new Map();
      await walkDirectory(handle, '', 0, cache);
    }
    return cache;
  }
  return {
    async listRelativePaths() {
      return [...(await files()).keys()];
    },
    async readFile(rel) {
      const fileHandle = (await files()).get(rel);
      if (!fileHandle) throw new Error('在已授权的文件夹里没有找到这张图片');
      const file = await fileHandle.getFile();
      return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    },
  };
}

function createChromeDeps() {
  let port;
  let importHandler = () => {};
  let announced = false;
  const connect = () => {
    port = chrome.runtime.connect({ name: 'panel' });
    port.onMessage.addListener((message) => {
      if (message?.type === 'import-text') importHandler(message);
    });
    port.onDisconnect.addListener(() => setTimeout(connect, 300));
    if (!announced) {
      port.postMessage({ type: 'resize', mode: 'collapsed' });
      announced = true;
    }
  };
  connect();

  chrome.storage.local.get('forgetImageFolder').then(async (data) => {
    if (!data.forgetImageFolder) return;
    await deleteDirectoryHandle();
    await chrome.storage.local.set({ forgetImageFolder: false });
  });

  return {
    async loadEntitlement() {
      const data = await chrome.storage.local.get(['trialStartedAt', 'licenseKey']);
      if (!data.trialStartedAt) {
        data.trialStartedAt = Date.now();
        await chrome.storage.local.set({ trialStartedAt: data.trialStartedAt });
      }
      return resolveEntitlement(data, verifyLicenseKey);
    },
    async hasOrigins(origins) {
      if (!origins.length) return true;
      return chrome.permissions.contains({ origins });
    },
    requestOrigins(origins) {
      return chrome.permissions.request({ origins });
    },
    async getGrantedFolder() {
      const handle = await loadDirectoryHandle();
      if (!handle) return null;
      const permission = await handle.queryPermission({ mode: 'read' });
      return permission === 'granted' ? bindFolder(handle) : null;
    },
    async hasRememberedFolder() {
      const handle = await loadDirectoryHandle();
      if (!handle) return false;
      const permission = await handle.queryPermission({ mode: 'read' });
      return permission !== 'granted';
    },
    pickFolder() {
      return chooseFolder('pick');
    },
    regrantFolder() {
      return chooseFolder('regrant');
    },
    async fetchRemote(url) {
      const response = await chrome.runtime.sendMessage({ type: 'fetch-image', url });
      if (!response?.ok) throw new Error(response?.error || '下载图片失败');
      return { mime: response.mime, bytes: base64ToBytes(response.base64) };
    },
    async uploadImage({ bytes, mime, filename }) {
      const response = await requestEditor(port, {
        type: 'upload-image',
        payload: { base64: bytesToBase64(bytes), mime, filename },
      }, 'upload-result');
      if (!response?.ok || !response.url) throw new Error(response?.error || '上传图片失败');
      return response.url;
    },
    insertArticle(article) {
      return requestEditor(port, { type: 'insert', article }, 'insert-result');
    },
    resize(mode) {
      port.postMessage({ type: 'resize', mode });
    },
    onImportText(handler) {
      importHandler = handler;
    },
    openOptions() {
      chrome.runtime.openOptionsPage();
    },
  };
}

async function chooseFolder(mode) {
  const ready = waitForFolderReady();
  const opened = await chrome.runtime.sendMessage({ type: 'open-folder-picker', mode });
  if (!opened?.ok) throw new Error(opened?.error || '打不开文件夹选择窗口');
  const result = await ready;
  if (!result?.ok) return null;
  const handle = await loadDirectoryHandle();
  if (!handle) return null;
  const permission = await handle.queryPermission({ mode: 'read' });
  if (permission !== 'granted') return null;
  return bindFolder(handle);
}

function waitForFolderReady() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMessage);
      resolve({ ok: false });
    }, 120000);
    function onMessage(message) {
      if (message?.type !== 'folder-ready') return;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onMessage);
      resolve(message);
    }
    chrome.runtime.onMessage.addListener(onMessage);
  });
}

function requestEditor(port, message, expectType) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      port.onMessage.removeListener(onMessage);
      resolve({ ok: false, error: '编辑器没有响应。请确认图文编辑页仍然打开。' });
    }, 30000);
    function onMessage(incoming) {
      if (incoming?.requestId !== requestId || incoming.type !== expectType) return;
      clearTimeout(timer);
      port.onMessage.removeListener(onMessage);
      resolve(incoming);
    }
    port.onMessage.addListener(onMessage);
    port.postMessage({ ...message, requestId });
  });
}

if (document.querySelector('#app')) {
  mountPanel(document.querySelector('#app'), createChromeDeps());
}
