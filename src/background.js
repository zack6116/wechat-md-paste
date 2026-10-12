import { HARD_IMAGE_BYTES } from './lib/constants.js';
import { bytesToBase64 } from './lib/bytes.js';
import { inspectRemoteImageUrl } from './lib/urls.js';

const channels = new Map();

chrome.runtime.onInstalled.addListener(() => {
  ensureTrial();
});
chrome.runtime.onStartup.addListener(() => {
  ensureTrial();
});

chrome.runtime.onConnect.addListener((port) => {
  const tabId = port.sender?.tab?.id;
  if (tabId == null || (port.name !== 'editor' && port.name !== 'panel')) return;
  let pair = channels.get(tabId);
  if (!pair) {
    pair = { editor: null, panel: null, pending: null };
    channels.set(tabId, pair);
  }
  pair[port.name] = port;
  if (port.name === 'panel' && pair.pending) {
    port.postMessage(pair.pending);
    pair.pending = null;
  }
  port.onDisconnect.addListener(() => {
    if (pair[port.name] === port) pair[port.name] = null;
    if (!pair.editor && !pair.panel) channels.delete(tabId);
  });
  port.onMessage.addListener((message) => {
    const otherName = port.name === 'editor' ? 'panel' : 'editor';
    const other = pair[otherName];
    if (!other) {
      if (port.name === 'editor' && message?.type === 'import-text') pair.pending = message;
      return;
    }
    other.postMessage(message);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === 'open-folder-picker') {
    openFolderPicker(message.mode).then(sendResponse);
    return true;
  }
  if (message?.type !== 'fetch-image') return false;
  const senderUrl = sender.url || '';
  const fromExtension = senderUrl.startsWith(chrome.runtime.getURL(''));
  const fromEditor = senderUrl.startsWith('https://mp.weixin.qq.com/');
  if (!fromExtension && !fromEditor) {
    sendResponse({ ok: false, error: '不能从当前页面下载图片' });
    return false;
  }
  fetchRemoteImage(message.url).then(sendResponse);
  return true;
});

async function openFolderPicker(mode) {
  const pickerMode = mode === 'regrant' ? 'regrant' : 'pick';
  const url = chrome.runtime.getURL(`src/panel/folder-picker.html?mode=${pickerMode}`);
  try {
    await chrome.windows.create({ url, type: 'popup', width: 420, height: 260, focused: true });
  } catch {
    await chrome.tabs.create({ url });
  }
  return { ok: true };
}

async function ensureTrial() {
  const data = await chrome.storage.local.get('trialStartedAt');
  if (!data.trialStartedAt) {
    await chrome.storage.local.set({ trialStartedAt: Date.now() });
  }
}

async function fetchRemoteImage(rawUrl) {
  const checked = inspectRemoteImageUrl(rawUrl);
  if (!checked.ok) return { ok: false, error: checked.reason };
  try {
    const response = await fetch(checked.url, {
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { ok: false, error: `下载图片失败（${response.status}）` };
    const finalCheck = inspectRemoteImageUrl(response.url || rawUrl);
    if (!finalCheck.ok) return { ok: false, error: finalCheck.reason };
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > HARD_IMAGE_BYTES) return { ok: false, error: '图片超过 8MB，已跳过' };
    const mime = (response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
    return { ok: true, mime, base64: bytesToBase64(new Uint8Array(buffer)) };
  } catch {
    return { ok: false, error: '下载图片失败，请检查地址或网络' };
  }
}
