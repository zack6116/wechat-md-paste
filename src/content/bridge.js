import { describeBundle, normalizeRelative, relativeToMarkdown } from '../lib/bundle.js';
import { EDITOR_SOURCE, isEditorResponse } from '../lib/channel.js';
import { filesFromDataTransfer } from '../lib/drop-files.js';
import { looksLikeMarkdown } from '../lib/markdown.js';
import { placePanel } from '../lib/placement.js';

let mounted = false;
let panelMode = 'collapsed';
let toolbarCache = { anchor: null, controls: [] };
const CREATE_LABEL = /^[+＋]?(新的)?创作$/;

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
  document.documentElement.append(iframe);
  applySize(iframe, 'collapsed');
  watchLayout(iframe);

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

  async function onDrop(event) {
    dragDepth = 0;
    overlay.style.display = 'none';
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const entries = await filesFromDataTransfer(event.dataTransfer);
      const described = describeBundle(entries);
      if (described.error) {
        port.postMessage({ type: 'import-text', error: described.error });
        return;
      }
      const markdown = entries.find((entry) => normalizeRelative(entry.relativePath) === described.markdownPath);
      const text = await markdown.file.text();
      let files = null;
      if (described.mode === 'directory') {
        files = [];
        for (const entry of entries) {
          const rel = relativeToMarkdown(described.base, entry.relativePath);
          if (!rel || !/\.(png|jpe?g|gif|webp)$/i.test(rel)) continue;
          files.push({ relativePath: rel, name: entry.name, bytes: await entry.file.arrayBuffer() });
        }
      }
      port.postMessage({ type: 'import-text', text, notice: described.notice || '', files });
    } catch {
      port.postMessage({ type: 'import-text', error: '没有读到拖入的目录' });
    }
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
    if (message?.type === 'focus-body') {
      const result = await callMain('focus-body', {}, 45000);
      port.postMessage({
        type: 'focus-body-result',
        requestId: message.requestId,
        ok: !!result.ok,
        error: result.ok ? '' : result.error || '无法聚焦正文',
      });
      return;
    }
    if (message?.type === 'ping-editor') {
      const result = await callMain('ping');
      port.postMessage({
        type: 'ping-editor-result',
        requestId: message.requestId,
        ok: !!result.ok,
        payload: result.payload || {},
        error: result.ok ? '' : result.error || '编辑器没有响应',
      });
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

function watchLayout(iframe) {
  let frame = 0;
  let needsScan = true;
  const schedule = (rescan) => {
    if (rescan) needsScan = true;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const scan = needsScan;
      needsScan = false;
      applySize(iframe, undefined, scan);
    });
  };
  window.addEventListener('resize', () => schedule(false));
  window.addEventListener('scroll', () => schedule(false), true);
  const observer = new MutationObserver((records) => {
    if (records.every((record) => record.target === iframe || iframe.contains(record.target))) return;
    schedule(true);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  const settle = setInterval(() => schedule(true), 1000);
  setTimeout(() => clearInterval(settle), 8000);
}

function applySize(iframe, mode, rescan = true) {
  if (mode) panelMode = mode;
  const measured = measureToolbar(rescan);
  const placed = placePanel({
    mode: panelMode,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    anchor: measured.anchor,
    obstacles: measured.obstacles,
  });
  const expanded = panelMode === 'expanded' || panelMode === 'log';
  iframe.style.cssText = [
    'position:fixed',
    `top:${Math.round(placed.top)}px`,
    `right:${Math.round(placed.right)}px`,
    'border:0',
    'overflow:hidden',
    'z-index:2147483646',
    `border-radius:${expanded ? '16px' : '999px'}`,
    'background:transparent',
    'color-scheme:light',
    'visibility:visible',
    `width:${Math.round(placed.width)}px`,
    `height:${Math.round(placed.height)}px`,
    `box-shadow:${expanded ? '0 12px 40px rgba(0,0,0,.16)' : '0 4px 14px rgba(7,193,96,.35)'}`,
  ].join(';');
}

function measureToolbar(rescan) {
  if (!rescan && toolbarCache.controls.length) {
    const controls = toolbarCache.controls.filter((element) => element.isConnected);
    const anchorEl = toolbarCache.anchor?.isConnected ? toolbarCache.anchor : null;
    return {
      anchor: anchorEl ? viewRect(anchorEl) : null,
      obstacles: controls.filter((element) => element !== anchorEl).map(viewRect),
    };
  }
  const controls = listControls();
  const anchorEl = pickCreateButton(controls);
  toolbarCache = { anchor: anchorEl, controls };
  return {
    anchor: anchorEl ? viewRect(anchorEl) : null,
    obstacles: controls.filter((element) => element !== anchorEl).map(viewRect),
  };
}

function pickCreateButton(controls) {
  const candidates = controls.filter((element) => CREATE_LABEL.test(labelOf(element)));
  for (const host of findCreateHosts()) candidates.push(host);
  const matches = candidates
    .map((element) => ({ element, rect: viewRect(element) }))
    .filter(({ rect }) => rect.top < 220 && rect.left > window.innerWidth * 0.35 && rect.width >= 8 && rect.height >= 8 && rect.width <= 240 && rect.height <= 80);
  matches.sort((a, b) => b.rect.right - a.rect.right || a.rect.top - b.rect.top);
  return matches[0]?.element || null;
}

function findCreateHosts() {
  const hosts = [];
  for (const doc of sameOriginDocs({ skipEditorBody: true })) {
    if (!doc.body) continue;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue.replace(/\s+/g, '');
        if (CREATE_LABEL.test(text) && node.parentElement) {
        const host = clickableHost(node.parentElement);
        if (host && !host.closest?.('.ProseMirror, #ueditor_0, #js_editor, #js_editor_area, .rich_media_content')) hosts.push(host);
      }
      node = walker.nextNode();
    }
  }
  return hosts;
}

function clickableHost(element) {
  let current = element;
  while (current && current !== current.ownerDocument.documentElement) {
    const rect = current.getBoundingClientRect();
    if (rect.width > 280 || rect.height > 100) break;
    if (rect.width >= 8 && rect.height >= 8 && isInteractive(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function isInteractive(element) {
  const tag = element.tagName;
  if (tag === 'BUTTON' || tag === 'A' || element.getAttribute('role') === 'button') return true;
  const className = typeof element.className === 'string' ? element.className : '';
  if (/btn|creation|create/i.test(className)) return true;
  return CREATE_LABEL.test(labelOf(element)) && getComputedStyle(element).cursor === 'pointer';
}

function listControls() {
  const nodes = [];
  for (const doc of sameOriginDocs()) {
    nodes.push(...doc.querySelectorAll('button, a, [role="button"], .weui-desktop-btn, #js_send, #js_preview, #js_submit'));
  }
  return nodes.filter((element) => {
    if (element.closest?.('#wmp-panel, .ProseMirror, #ueditor_0, #js_editor, #js_editor_area, .rich_media_content')) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8 || rect.width > 280 || rect.height > 80) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function sameOriginDocs({ skipEditorBody = false } = {}) {
  const docs = [document];
  for (const frame of document.querySelectorAll('iframe')) {
    if (frame.id === 'wmp-panel') continue;
    if (skipEditorBody && /ueditor|js_editor/i.test(`${frame.id} ${frame.className}`)) continue;
    try {
      if (frame.contentDocument) docs.push(frame.contentDocument);
    } catch {
      // Cross-origin frames are not part of the admin toolbar.
    }
  }
  return docs;
}

function labelOf(element) {
  return (element.textContent || '').replace(/\s+/g, '');
}

function viewRect(element) {
  const rect = element.getBoundingClientRect();
  let x = 0;
  let y = 0;
  let doc = element.ownerDocument;
  while (doc && doc !== document) {
    const frame = frameFor(doc);
    if (!frame) break;
    const host = frame.getBoundingClientRect();
    x += host.left;
    y += host.top;
    doc = frame.ownerDocument;
  }
  return {
    top: rect.top + y,
    left: rect.left + x,
    right: rect.right + x,
    bottom: rect.bottom + y,
    width: rect.width,
    height: rect.height,
  };
}

function frameFor(doc) {
  const parent = doc.defaultView?.parent?.document;
  if (!parent) return null;
  for (const frame of parent.querySelectorAll('iframe')) {
    try {
      if (frame.contentDocument === doc) return frame;
    } catch {
      // Ignore frames the page cannot read.
    }
  }
  return null;
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
