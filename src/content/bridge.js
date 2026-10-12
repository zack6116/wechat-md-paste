import { EDITOR_SOURCE, isEditorResponse } from '../lib/channel.js';
import { looksLikeMarkdown } from '../lib/markdown.js';

let mounted = false;

export function start() {
  const watch = setInterval(async () => {
    if (await editorPage()) {
      clearInterval(watch);
      mount();
    }
  }, 1000);
  editorPage().then((yes) => {
    if (yes) {
      clearInterval(watch);
      mount();
    }
  });
}

function mount() {
  if (mounted || document.getElementById('wmp-panel')) return;
  mounted = true;
  const iframe = document.createElement('iframe');
  iframe.id = 'wmp-panel';
  iframe.title = '导入 Markdown';
  iframe.src = chrome.runtime.getURL('src/panel/panel.html');
  iframe.setAttribute('allow', 'clipboard-read');
  iframe.setAttribute('scrolling', 'no');
  applySize(iframe, 'collapsed');
  document.documentElement.append(iframe);

  const overlay = document.createElement('div');
  overlay.textContent = '松开以导入 Markdown';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'background:rgba(7,193,96,.14)',
    'color:#067a3d',
    'font:600 22px/1.4 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif',
  ].join(';');
  document.documentElement.append(overlay);

  let port;
  const connect = () => {
    port = chrome.runtime.connect({ name: 'editor' });
    port.onMessage.addListener(onPanelMessage);
    port.onDisconnect.addListener(() => setTimeout(connect, 300));
  };
  connect();

  let dragDepth = 0;
  bindSurface(document);
  const bindFrames = () => {
    for (const frame of document.querySelectorAll('iframe')) {
      if (frame.id === 'wmp-panel') continue;
      try {
        bindSurface(frame.contentDocument);
      } catch {
        // Cross-origin frames are not part of the editor body.
      }
    }
  };
  bindFrames();
  const observer = new MutationObserver(bindFrames);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  function bindSurface(target) {
    if (!target || target.__wmpBound) return;
    target.__wmpBound = true;
    target.addEventListener('paste', onPaste, true);
    target.addEventListener('dragenter', onDragEnter, true);
    target.addEventListener('dragover', onDragOver, true);
    target.addEventListener('dragleave', onDragLeave, true);
    target.addEventListener('drop', onDrop, true);
  }

  function onDragEnter(event) {
    if (!hasFiles(event)) return;
    dragDepth += 1;
    overlay.style.display = 'flex';
    event.preventDefault();
  }

  function onDragOver(event) {
    if (!hasFiles(event)) return;
    event.preventDefault();
  }

  function onDragLeave() {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) overlay.style.display = 'none';
  }

  function onDrop(event) {
    dragDepth = 0;
    overlay.style.display = 'none';
    const files = [...(event.dataTransfer?.files || [])];
    const markdown = files.filter((file) => /\.(md|markdown)$/i.test(file.name) || file.type === 'text/markdown');
    if (!markdown.length) return;
    event.preventDefault();
    event.stopPropagation();
    const notice = markdown.length > 1 ? '批量导入尚未提供，这次只导入了第一个文件。' : '';
    markdown[0].text().then((text) => port.postMessage({ type: 'import-text', text, notice }));
  }

  function onPaste(event) {
    if (event.composedPath().some((node) => node?.id === 'wmp-panel')) return;
    const data = event.clipboardData;
    if (!data) return;
    const markdownFile = [...data.files].find((file) => /\.(md|markdown)$/i.test(file.name));
    if (markdownFile) {
      event.preventDefault();
      event.stopPropagation();
      markdownFile.text().then((text) => port.postMessage({ type: 'import-text', text }));
      return;
    }
    if (data.files.length) return;
    const text = data.getData('text/plain');
    if (!looksLikeMarkdown(text) || !isEditorTarget(event)) return;
    event.preventDefault();
    event.stopPropagation();
    port.postMessage({ type: 'import-text', text });
  }

  async function onPanelMessage(message) {
    if (message?.type === 'resize') {
      applySize(iframe, message.mode);
      return;
    }
    if (message?.type === 'upload-image') {
      const result = await callMain('upload-image', message.payload);
      port.postMessage({
        type: 'upload-result',
        requestId: message.requestId,
        ok: !!result.ok && !!result.payload?.url,
        url: result.payload?.url || '',
        error: result.ok ? '' : result.error || '上传图片失败',
      });
      return;
    }
    if (message?.type === 'insert') {
      const inserted = await callMain('insert-html', { html: message.article?.html || '' });
      if (!inserted.ok) {
        port.postMessage({
          type: 'insert-result',
          requestId: message.requestId,
          ok: false,
          error: inserted.error || '写入编辑器失败',
        });
        return;
      }
      let title = 'skipped';
      if (message.article?.title) {
        const titleResult = await callMain('set-title', { title: message.article.title });
        title = titleResult.payload?.updated ? 'updated' : titleResult.payload?.reason || 'missing';
      }
      let cover = 'skipped';
      if (message.article?.coverUrl) {
        const coverResult = await callMain('set-cover', { url: message.article.coverUrl });
        cover = coverResult.payload?.updated ? 'updated' : coverResult.payload?.reason || 'missing';
      }
      port.postMessage({ type: 'insert-result', requestId: message.requestId, ok: true, title, cover });
    }
  }
}

function applySize(iframe, mode) {
  const expanded = mode === 'expanded';
  iframe.style.cssText = [
    'position:fixed',
    'top:80px',
    'right:24px',
    'border:0',
    'overflow:hidden',
    'z-index:2147483646',
    `border-radius:${expanded ? '16px' : '999px'}`,
    'background:transparent',
    'color-scheme:light',
    `width:${expanded ? 'min(380px, calc(100vw - 48px))' : '208px'}`,
    `height:${expanded ? 'min(640px, calc(100vh - 104px))' : '56px'}`,
    `box-shadow:${expanded ? '0 12px 40px rgba(0,0,0,.16)' : '0 10px 28px rgba(7,193,96,.45), 0 2px 8px rgba(0,0,0,.16)'}`,
  ].join(';');
}

function hasFiles(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files');
}

function isEditorTarget(event) {
  const path = event.composedPath();
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return false;
    if (/title/i.test(`${node.id} ${node.className}`)) return false;
  }
  return path.some((node) => {
    if (!(node instanceof Element)) return false;
    if (node.matches?.('.ProseMirror, #ueditor_0, #js_editor, #js_editor_area, .rich_media_content')) return true;
    return node.isContentEditable;
  });
}

async function editorPage() {
  if (/appmsg/i.test(location.href) && (/edit/i.test(location.href) || /type=(10|77)/.test(location.search))) {
    return true;
  }
  const ping = await callMain('ping', {}, 800);
  return !!ping.payload?.isEditor;
}

function callMain(type, payload, timeout = 20000) {
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve({ ok: false, error: '编辑器没有响应。请确认当前是图文编辑页。' });
    }, timeout);
    function onMessage(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!isEditorResponse(data, id)) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(data);
    }
    window.addEventListener('message', onMessage);
    window.postMessage({ source: EDITOR_SOURCE, direction: 'request', id, type, payload }, location.origin);
  });
}

start();
